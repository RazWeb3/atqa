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
import { recognizeSpeech } from "./speech-recognizer.server";
import {
  reviewAudioWithGemini,
  ModelOutputInvalidError,
} from "./gemini-reviewer.server";
import type {
  ReviewIssue,
  ReviewResponse,
  ReviewStatus,
} from "./review-contract";

const ASR_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.ASR_CONFIDENCE_THRESHOLD || "0.75",
);

export type ReviewDependencies = {
  fetchAudio: typeof fetchAudio;
  recognizeSpeech: typeof recognizeSpeech;
  reviewAudioWithGemini: typeof reviewAudioWithGemini;
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

  // Stage 1: Synthesis text review
  const stage1 = await reviewSynthesisText(unit);

  // Get canonical reading
  const canonical = await createCanonicalReading(unit.displayText);

  // If canonical reading is undefined, return inconclusive
  if (canonical.status === "undefined") {
    return {
      unitId: unit.id,
      status: "inconclusive",
      synthesisReview: stage1.issues,
      audioReview: [
        {
          code: "UNDEFINED_READING",
          status: "inconclusive",
          sourceStage: "audio",
          expected: null,
          observed: null,
          startSec: null,
          endSec: null,
          reason: `期待読みが未定義です: ${canonical.unknownTokens.join(", ")}`,
        },
      ],
      asrTranscript: null,
      asrConfidence: null,
    };
  }

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
          expected: canonical.comparison,
          observed: sttResult.transcript,
          startSec: null,
          endSec: null,
          reason: `音声認識の信頼度が低いです (${sttResult.confidence?.toFixed(2) || "N/A"})`,
        },
      ],
      asrTranscript: sttResult.transcript,
      asrConfidence: sttResult.confidence,
    };
  }

  // Normalize STT transcript and align with expected reading
  const sttComparison = normalizeComparisonKana(sttResult.transcript);
  const edits = alignReadings(canonical.comparison, sttComparison);
  const sttHasDifferences = hasDifferences(edits);

  // Run Gemini review
  let geminiResult;
  try {
    geminiResult = await geminiReviewer({
      audio: audioBuffer,
      mimeType: "audio/mpeg",
      displayText: unit.displayText,
      expectedReading: canonical.comparison,
      synthesisText: unit.synthesisText,
      sttTranscript: sttResult.transcript,
      candidateEdits: edits,
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
          expected: canonical.comparison,
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

  // Determine final verdict based on STT diff and Gemini verdict
  const { status, audioReview } = determineVerdict(
    sttHasDifferences,
    geminiResult.verdict,
    geminiResult.heardReading,
    geminiResult.startSec,
    geminiResult.endSec,
    geminiResult.reason,
    canonical.comparison,
    sttComparison,
  );

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
