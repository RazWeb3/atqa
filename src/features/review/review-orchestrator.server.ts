import type { PlaybackUnit } from "@/features/content/types";
import {
  alignReadings,
  hasDifferences,
} from "@/features/pronunciation/align-readings";
import { createCanonicalReading } from "@/features/pronunciation/canonical-reading";
import { normalizeComparisonKana } from "@/features/pronunciation/kana";
import { reviewSynthesisText } from "./synthesis-review";
import { fetchAudio } from "@/features/audio/audio-fetcher.server";
import { getAllowedHosts, validateAudioUrl } from "@/features/audio/audio-policy";
import { recognizeSpeech, type SpeechWord } from "./speech-recognizer.server";
import { loadWhitelist } from "./reading-whitelist.server";
import type { WhitelistEntry } from "./reading-whitelist";
import {
  reviewAudioWithGemini,
  ModelOutputInvalidError,
} from "./gemini-reviewer.server";
import type {
  GeminiReview,
  ReviewIssue,
  ReviewResponse,
  ReviewStatus,
} from "./review-contract";

const ASR_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.ASR_CONFIDENCE_THRESHOLD || "0.75",
);

// Words below this per-word STT confidence are surfaced as hard-to-hear
// spots (AUDIO_UNCLEAR_SUSPECT) instead of silently passing.
const ASR_WORD_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.ASR_WORD_CONFIDENCE_THRESHOLD || "0.6",
);

// Cap unclear-word findings per unit so a noisy recording does not flood
// the review panel.
const MAX_UNCLEAR_WORD_ISSUES = 5;

export type ReviewDependencies = {
  fetchAudio: typeof fetchAudio;
  recognizeSpeech: typeof recognizeSpeech;
  reviewAudioWithGemini: typeof reviewAudioWithGemini;
  loadWhitelist: typeof loadWhitelist;
};

/**
 * Review a single playback unit through Stage 1 and Stage 2.
 */
export async function reviewUnit(
  unit: PlaybackUnit,
  deps?: Partial<ReviewDependencies>,
): Promise<ReviewResponse> {
  const audioFetcher = deps?.fetchAudio || fetchAudio;
  const speechRecognizer = deps?.recognizeSpeech || recognizeSpeech;
  const geminiReviewer = deps?.reviewAudioWithGemini || reviewAudioWithGemini;
  const whitelistLoader = deps?.loadWhitelist || loadWhitelist;

  // Human-approved readings overlay the pronunciation dictionary, so a
  // one-click approval resolves the token deterministically from then on.
  const whitelist = await whitelistLoader();
  const extraCorrections = Object.fromEntries(
    whitelist.map((entry) => [entry.token, entry.reading]),
  );

  // Stage 1: Synthesis text review
  const stage1 = await reviewSynthesisText(unit, extraCorrections);

  // Get canonical reading. When unknown word-like tokens remain, fall back
  // to assumed-reading mode: Gemini derives the conventional reading itself
  // instead of the unit being written off as inconclusive.
  const canonical = await createCanonicalReading(
    unit.displayText,
    extraCorrections,
  );
  const unknownTokens =
    canonical.status === "undefined" ? canonical.unknownTokens : null;
  const expectedComparison =
    canonical.status === "defined" ? canonical.comparison : null;

  // Fetch audio
  let audioBuffer: Buffer;
  try {
    const allowedHosts = getAllowedHosts();
    const validatedUrl = validateAudioUrl(unit.audioUrl, allowedHosts);
    const result = await audioFetcher(validatedUrl, null);
    audioBuffer = Buffer.from(result.body);
  } catch {
    return {
      unitId: unit.id,
      status: "inconclusive",
      synthesisReview: stage1.issues,
      audioReview: [
        {
          code: "AUDIO_FETCH_FAILED",
          status: "inconclusive",
          sourceStage: "audio",
          expected: null,
          observed: null,
          startSec: null,
          endSec: null,
          reason: "音声の取得に失敗しました",
        },
      ],
      asrTranscript: null,
      asrConfidence: null,
    };
  }

  // Run STT
  let sttResult;
  try {
    sttResult = await speechRecognizer(audioBuffer);
  } catch {
    return {
      unitId: unit.id,
      status: "inconclusive",
      synthesisReview: stage1.issues,
      audioReview: [
        {
          code: "LOW_ASR_CONFIDENCE",
          status: "inconclusive",
          sourceStage: "audio",
          expected: null,
          observed: null,
          startSec: null,
          endSec: null,
          reason: "音声認識に失敗しました",
        },
      ],
      asrTranscript: null,
      asrConfidence: null,
    };
  }

  // Locate hard-to-hear spots from per-word STT confidence. These are
  // reported even when the overall verdict passes, so weak audio never
  // slips through unflagged.
  const unclearIssues = detectUnclearWords(sttResult.words, whitelist);

  // Check STT confidence
  if (
    sttResult.confidence === null ||
    sttResult.confidence < ASR_CONFIDENCE_THRESHOLD
  ) {
    return {
      unitId: unit.id,
      status: "inconclusive",
      synthesisReview: stage1.issues,
      audioReview: [
        {
          code: "LOW_ASR_CONFIDENCE",
          status: "inconclusive",
          sourceStage: "audio",
          expected: expectedComparison,
          observed: sttResult.transcript,
          startSec: null,
          endSec: null,
          reason: `音声認識の信頼度が低いです (${sttResult.confidence?.toFixed(2) || "N/A"})`,
        },
        // Word spans give the human a concrete place to listen even when
        // the unit as a whole cannot be judged.
        ...unclearIssues,
      ],
      asrTranscript: sttResult.transcript,
      asrConfidence: sttResult.confidence,
    };
  }

  // Normalize STT transcript and align with expected reading. In
  // assumed-reading mode there is no expected reading to align against.
  const sttComparison = normalizeComparisonKana(sttResult.transcript);
  const edits =
    expectedComparison !== null
      ? alignReadings(expectedComparison, sttComparison)
      : [];
  const sttHasDifferences = hasDifferences(edits);

  // Run Gemini review
  let geminiResult;
  try {
    geminiResult = await geminiReviewer({
      audio: audioBuffer,
      mimeType: "audio/mpeg",
      displayText: unit.displayText,
      expectedReading: expectedComparison ?? "",
      synthesisText: unit.synthesisText,
      sttTranscript: sttResult.transcript,
      candidateEdits: edits,
      unknownTokens,
    });
  } catch (error) {
    const code =
      error instanceof ModelOutputInvalidError
        ? "MODEL_OUTPUT_INVALID"
        : "MODEL_OUTPUT_INVALID";

    return {
      unitId: unit.id,
      status: "inconclusive",
      synthesisReview: stage1.issues,
      audioReview: [
        {
          code,
          status: "inconclusive",
          sourceStage: "audio",
          expected: expectedComparison,
          observed: null,
          startSec: null,
          endSec: null,
          reason: "AIレビューに失敗しました",
        },
      ],
      asrTranscript: sttResult.transcript,
      asrConfidence: sttResult.confidence,
    };
  }

  // Determine final verdict. In assumed-reading mode Gemini is the sole
  // judge because the STT diff has no baseline to vote with.
  const verdict =
    unknownTokens !== null
      ? determineAssumedVerdict(geminiResult, unknownTokens)
      : determineVerdict(
          sttHasDifferences,
          geminiResult.verdict,
          geminiResult.heardReading,
          geminiResult.startSec,
          geminiResult.endSec,
          geminiResult.reason,
          expectedComparison ?? "",
          sttComparison,
        );

  // Unclear-word findings ride along with the verdict; a passing unit with
  // hard-to-hear spots still needs a human ear.
  const audioReview = [...verdict.audioReview, ...unclearIssues];
  const status =
    verdict.status === "pass" && unclearIssues.length > 0
      ? "review"
      : verdict.status;

  return {
    unitId: unit.id,
    status,
    synthesisReview: stage1.issues,
    audioReview,
    asrTranscript: sttResult.transcript,
    asrConfidence: sttResult.confidence,
  };
}

/**
 * Flag words the STT engine itself struggled with as hard-to-hear spots.
 * Whitelisted tokens/readings are skipped: a human already confirmed them.
 */
function detectUnclearWords(
  words: SpeechWord[],
  whitelist: WhitelistEntry[],
): ReviewIssue[] {
  const approved = new Set<string>();
  for (const entry of whitelist) {
    approved.add(normalizeComparisonKana(entry.token));
    approved.add(normalizeComparisonKana(entry.reading));
  }

  return words
    .filter(
      (word) =>
        word.confidence !== null &&
        word.confidence < ASR_WORD_CONFIDENCE_THRESHOLD &&
        word.text.length > 0 &&
        !approved.has(normalizeComparisonKana(word.text)),
    )
    .slice(0, MAX_UNCLEAR_WORD_ISSUES)
    .map((word) => ({
      code: "AUDIO_UNCLEAR_SUSPECT" as const,
      status: "review" as const,
      sourceStage: "audio" as const,
      expected: null,
      observed: word.text,
      startSec: word.startSec,
      endSec: word.endSec,
      reason: `音声認識の信頼度が低い語です (${word.confidence!.toFixed(2)})`,
    }));
}

/**
 * Determine the verdict in assumed-reading mode (unknown tokens without a
 * dictionary reading). Gemini judges against the conventional reading it
 * assumed itself, so mismatch requires audible evidence.
 */
function determineAssumedVerdict(
  gemini: GeminiReview,
  unknownTokens: string[],
): { status: ReviewStatus; audioReview: ReviewIssue[] } {
  if (gemini.verdict === "match") {
    return { status: "pass", audioReview: [] };
  }

  if (
    gemini.verdict === "mismatch" &&
    gemini.heardReading &&
    gemini.startSec !== null
  ) {
    return {
      status: "review",
      audioReview: [
        {
          code: "AUDIO_PRONUNCIATION_SUSPECT",
          status: "review",
          sourceStage: "audio",
          expected: null,
          observed: gemini.heardReading,
          startSec: gemini.startSec,
          endSec: gemini.endSec,
          reason: `AI推定読みでの判定: ${gemini.reason || "発音の不一致が検出されました"}`,
          tokens: unknownTokens,
        },
      ],
    };
  }

  // Inconclusive verdict, or mismatch without evidence
  return {
    status: "inconclusive",
    audioReview: [
      {
        code: "UNDEFINED_READING",
        status: "inconclusive",
        sourceStage: "audio",
        expected: null,
        observed: gemini.heardReading,
        startSec: gemini.startSec,
        endSec: gemini.endSec,
        reason: `AI推定読みでも判定できませんでした（辞書未登録: ${unknownTokens.join(", ")}）${gemini.reason ? ` — ${gemini.reason}` : ""}`,
        tokens: unknownTokens,
      },
    ],
  };
}

/**
 * Determine the final verdict based on STT differences and Gemini verdict.
 */
function determineVerdict(
  sttHasDifferences: boolean,
  geminiVerdict: "match" | "mismatch" | "inconclusive",
  heardReading: string | null,
  startSec: number | null,
  endSec: number | null,
  reason: string,
  expectedReading: string,
  observedReading: string,
): { status: ReviewStatus; audioReview: ReviewIssue[] } {
  // Gemini inconclusive -> inconclusive
  if (geminiVerdict === "inconclusive") {
    return {
      status: "inconclusive",
      audioReview: [
        {
          code: "ASR_GEMINI_CONFLICT",
          status: "inconclusive",
          sourceStage: "audio",
          expected: expectedReading,
          observed: observedReading,
          startSec,
          endSec,
          reason: reason || "AIの判断が不能です",
        },
      ],
    };
  }

  // STT match + Gemini match -> pass
  if (!sttHasDifferences && geminiVerdict === "match") {
    return { status: "pass", audioReview: [] };
  }

  // STT mismatch + Gemini mismatch -> review
  if (sttHasDifferences && geminiVerdict === "mismatch") {
    return {
      status: "review",
      audioReview: [
        {
          code: "AUDIO_PRONUNCIATION_SUSPECT",
          status: "review",
          sourceStage: "audio",
          expected: expectedReading,
          observed: heardReading || observedReading,
          startSec,
          endSec,
          reason: reason || "発音の不一致が検出されました",
        },
      ],
    };
  }

  // STT match + Gemini mismatch with reading/time -> review
  if (
    !sttHasDifferences &&
    geminiVerdict === "mismatch" &&
    heardReading &&
    startSec !== null
  ) {
    return {
      status: "review",
      audioReview: [
        {
          code: "AUDIO_PRONUNCIATION_SUSPECT",
          status: "review",
          sourceStage: "audio",
          expected: expectedReading,
          observed: heardReading,
          startSec,
          endSec,
          reason: reason || "発音の不一致が検出されました",
        },
      ],
    };
  }

  // STT mismatch + Gemini match -> inconclusive (conflict)
  if (sttHasDifferences && geminiVerdict === "match") {
    return {
      status: "inconclusive",
      audioReview: [
        {
          code: "ASR_GEMINI_CONFLICT",
          status: "inconclusive",
          sourceStage: "audio",
          expected: expectedReading,
          observed: observedReading,
          startSec,
          endSec,
          reason: "STTとGeminiの判断が一致しません",
        },
      ],
    };
  }

  // STT match + Gemini mismatch without reading/time -> inconclusive
  return {
    status: "inconclusive",
    audioReview: [
      {
        code: "ASR_GEMINI_CONFLICT",
        status: "inconclusive",
        sourceStage: "audio",
        expected: expectedReading,
        observed: observedReading,
        startSec,
        endSec,
        reason: "Geminiの判断に根拠が不足しています",
      },
    ],
  };
}
