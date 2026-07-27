import type { PlaybackUnit } from "@/features/content/types";
import {
  alignReadings,
  hasDifferences,
} from "@/features/pronunciation/align-readings";
import {
  convertTextToComparisonReading,
  createCanonicalReading,
} from "@/features/pronunciation/canonical-reading";
import {
  normalizeComparisonKana,
  normalizeSoundKana,
} from "@/features/pronunciation/kana";
import { reviewSynthesisText } from "./synthesis-review";
import { fetchAudio } from "@/features/audio/audio-fetcher.server";
import { getAllowedHosts, validateAudioUrl } from "@/features/audio/audio-policy";
import { recognizeSpeech, type SpeechWord } from "./speech-recognizer.server";
import { loadWhitelist } from "./reading-whitelist.server";
import type { WhitelistEntry } from "./reading-whitelist";
import {
  reviewAudioWithGemini,
  transcribeAudioKana,
  ModelOutputInvalidError,
} from "./gemini-reviewer.server";
import type {
  GeminiFinding,
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
  transcribeAudioKana: typeof transcribeAudioKana;
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
  const kanaTranscriber = deps?.transcribeAudioKana || transcribeAudioKana;
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
  const unclearIssues = await detectUnclearWords(
    sttResult.words,
    whitelist,
    expectedComparison,
    extraCorrections,
  );

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

  // Normalize STT transcript and align with expected reading. Cloud STT
  // writes Japanese back in kanji (auto-normalizing misreads in the
  // process), so the transcript goes through the same dictionary +
  // kuromoji + letterwise-acronym pipeline as the expected reading;
  // otherwise kanji and Latin tokens would flag everything as different.
  const sttComparison = await convertTextToComparisonReading(
    sttResult.transcript,
    extraCorrections,
  );
  // Long-vowel spelling variants (えい/えー) and particle spellings
  // (は/わ) are not pronunciation differences, so the diff decision runs
  // on sound-normalized forms.
  const sttHasDifferences =
    expectedComparison !== null &&
    hasDifferences(
      alignReadings(
        normalizeSoundKana(expectedComparison),
        normalizeSoundKana(sttComparison),
      ),
    );

  // Run Gemini review. The reviewer transcribes the audio itself before
  // judging; STT output stays out of the prompt so its silent corrections
  // cannot bias the verdict.
  let geminiResult;
  try {
    geminiResult = await geminiReviewer({
      audio: audioBuffer,
      mimeType: "audio/mpeg",
      displayText: unit.displayText,
      expectedReading: expectedComparison ?? "",
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

  // Gemini's own as-heard transcript is a second, STT-independent ear.
  // Its comparison form both corroborates STT diffs Gemini's verdict
  // missed and surfaces misreads STT silently auto-corrected.
  const kanaComparison = geminiResult.kanaTranscript
    ? await convertTextToComparisonReading(
        geminiResult.kanaTranscript,
        extraCorrections,
      )
    : null;

  // Determine final verdict. In assumed-reading mode Gemini is the sole
  // judge because the STT diff has no baseline to vote with.
  let verdict =
    unknownTokens !== null
      ? determineAssumedVerdict(geminiResult, unknownTokens)
      : determineVerdict(
          sttHasDifferences,
          geminiResult,
          expectedComparison ?? "",
          sttComparison,
          kanaComparison,
        );

  // The review prompt shows Gemini the expected reading, and on some runs
  // the model anchors on it and normalizes real misreads back to "match"
  // (or omits them from findings). A blind kana transcription (no expected
  // reading shown) is free of that anchor, so it gets the last word twice:
  // it settles STT-vs-Gemini conflicts, and it back-fills misread spots
  // the anchored review missed on flagged units. It only ever adds
  // findings, never downgrades to a silent pass.
  const conflictNeedsBlindCheck =
    sttHasDifferences &&
    geminiResult.verdict === "match" &&
    verdict.status === "inconclusive";
  if (
    unknownTokens === null &&
    expectedComparison !== null &&
    (verdict.status === "review" || conflictNeedsBlindCheck)
  ) {
    try {
      const blindTranscript = await kanaTranscriber({
        audio: audioBuffer,
        mimeType: "audio/mpeg",
      });
      const blindComparison = await convertTextToComparisonReading(
        blindTranscript,
        extraCorrections,
      );
      // Sanity gate: a transcript wildly longer or shorter than the
      // expected reading is a runaway response (meta commentary, dropped
      // audio), not a hearing; its diff would be garbage findings.
      const lengthRatio =
        expectedComparison.length > 0
          ? blindComparison.length / expectedComparison.length
          : 0;
      if (lengthRatio < 0.6 || lengthRatio > 1.4) {
        throw new Error("blind transcript length out of range");
      }
      // Spots already reported stay reported; the blind diff only
      // contributes locations no pronunciation finding covered yet. The
      // conflict issue's observed field is the whole transcript, so it
      // must not act as coverage.
      const coveredReadings = verdict.audioReview
        .filter((issue) => issue.code === "AUDIO_PRONUNCIATION_SUSPECT")
        .map((issue) => issue.observed)
        .filter((observed): observed is string => !!observed)
        .map((observed) =>
          normalizeSoundKana(normalizeComparisonKana(observed)),
        );
      const blindIssues = kanaDiffIssues(
        normalizeSoundKana(expectedComparison),
        normalizeSoundKana(blindComparison),
        coveredReadings,
      );
      if (blindIssues.length > 0) {
        // A confirmed misread supersedes the conflict placeholder but
        // rides along with existing review findings.
        const kept =
          verdict.status === "review" ? verdict.audioReview : [];
        verdict = {
          status: "review",
          audioReview: [...kept, ...blindIssues],
        };
      }
    } catch {
      // The first opinion (review or conflict -> human check) stands.
    }
  }

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
 * Alphanumeric or kanji words whose reading already occurs in the expected
 * reading are also skipped: the engine merely re-spelled a sound it heard
 * fine ("9" for spelled-out きゅー, homophone 精製 for せいせい), which is
 * not an audio problem. Kana words stay flagged: their text IS the sound,
 * so low confidence there means the audio itself is unclear.
 */
async function detectUnclearWords(
  words: SpeechWord[],
  whitelist: WhitelistEntry[],
  expectedComparison: string | null,
  extraCorrections: Record<string, string>,
): Promise<ReviewIssue[]> {
  const approved = new Set<string>();
  for (const entry of whitelist) {
    approved.add(normalizeComparisonKana(entry.token));
    approved.add(normalizeComparisonKana(entry.reading));
  }

  const candidates = words.filter(
    (word) =>
      word.confidence !== null &&
      word.confidence < ASR_WORD_CONFIDENCE_THRESHOLD &&
      word.text.length > 0 &&
      !approved.has(normalizeComparisonKana(word.text)),
  );

  const issues: ReviewIssue[] = [];
  for (const word of candidates) {
    if (issues.length >= MAX_UNCLEAR_WORD_ISSUES) break;

    if (expectedComparison !== null && /[0-9A-Za-z\u4e00-\u9faf]/.test(word.text)) {
      const wordReading = await convertTextToComparisonReading(
        word.text,
        extraCorrections,
      );
      if (wordReading.length > 0 && expectedComparison.includes(wordReading)) {
        continue;
      }
    }

    issues.push({
      code: "AUDIO_UNCLEAR_SUSPECT" as const,
      status: "review" as const,
      sourceStage: "audio" as const,
      expected: null,
      observed: word.text,
      startSec: word.startSec,
      endSec: word.endSec,
      reason: `音声認識の信頼度が低い語です (${word.confidence!.toFixed(2)})`,
    });
  }

  return issues;
}

/**
 * Collect every mismatch location from a Gemini review. Falls back to the
 * single top-level heardReading/time fields when the findings array is
 * absent or empty, so older-style responses still yield one issue.
 */
function collectFindings(gemini: GeminiReview): GeminiFinding[] {
  if (gemini.findings && gemini.findings.length > 0) {
    return gemini.findings;
  }
  if (gemini.heardReading) {
    return [
      {
        heardReading: gemini.heardReading,
        reason: gemini.reason,
        startSec: gemini.startSec,
        endSec: gemini.endSec,
      },
    ];
  }
  return [];
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

  const findings = collectFindings(gemini);
  const evidenced = findings.filter((f) => f.startSec !== null);

  if (gemini.verdict === "mismatch" && evidenced.length > 0) {
    return {
      status: "review",
      audioReview: evidenced.map((finding) => ({
        code: "AUDIO_PRONUNCIATION_SUSPECT" as const,
        status: "review" as const,
        sourceStage: "audio" as const,
        expected: null,
        observed: finding.heardReading,
        startSec: finding.startSec,
        endSec: finding.endSec,
        reason: `AI推定読みでの判定: ${finding.reason || "発音の不一致が検出されました"}`,
        tokens: unknownTokens,
      })),
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
 * Build issues from segments where the model's own as-heard transcript
 * deviates from the expected reading. Segments already covered by an
 * explicit Gemini finding are skipped, as are one-character segments
 * (typical transcription jitter). Both sides are sound-normalized.
 */
function kanaDiffIssues(
  normalizedExpected: string,
  normalizedKana: string,
  coveredReadings: string[],
): ReviewIssue[] {
  const segments = alignReadings(normalizedExpected, normalizedKana).filter(
    (edit) =>
      edit.operation !== "equal" &&
      Math.max(edit.expected.length, edit.observed.length) >= 2 &&
      !(
        edit.observed.length > 0 &&
        coveredReadings.some((heard) => heard.includes(edit.observed))
      ),
  );

  return segments.slice(0, 3).map((edit) => ({
    code: "AUDIO_PRONUNCIATION_SUSPECT" as const,
    status: "review" as const,
    sourceStage: "audio" as const,
    expected: edit.expected || null,
    observed: edit.observed || null,
    startSec: null,
    endSec: null,
    reason: `AIの聴き取り転写が期待読みと異なります（期待:「${edit.expected || "(なし)"}」、聴取:「${edit.observed || "(なし)"}」）`,
  }));
}

/**
 * Determine the final verdict based on STT differences and Gemini verdict.
 * Every evidenced Gemini finding becomes its own issue, so a unit with
 * several misread spots lists all of them instead of just one.
 */
function determineVerdict(
  sttHasDifferences: boolean,
  gemini: GeminiReview,
  expectedReading: string,
  observedReading: string,
  kanaComparison: string | null,
): { status: ReviewStatus; audioReview: ReviewIssue[] } {
  const normalizedExpected = normalizeSoundKana(expectedReading);
  const normalizedKana =
    kanaComparison !== null && kanaComparison.length > 0
      ? normalizeSoundKana(kanaComparison)
      : null;

  // Drop findings whose heard reading already occurs in the expected
  // reading once spelling is sound-normalized (えい/えー, は/わ): those
  // are notation quibbles, not misreads.
  const findings = collectFindings(gemini).filter((finding) => {
    const heard = normalizeSoundKana(
      normalizeComparisonKana(finding.heardReading),
    );
    return !(heard.length > 0 && normalizedExpected.includes(heard));
  });
  const coveredReadings = findings.map((finding) =>
    normalizeSoundKana(normalizeComparisonKana(finding.heardReading)),
  );

  // A mismatch whose every finding was notation noise is a match.
  const geminiVerdict =
    gemini.verdict === "mismatch" && findings.length === 0
      ? "match"
      : gemini.verdict;

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
          startSec: gemini.startSec,
          endSec: gemini.endSec,
          reason: gemini.reason || "AIの判断が不能です",
        },
      ],
    };
  }

  const toIssue = (finding: GeminiFinding): ReviewIssue => ({
    code: "AUDIO_PRONUNCIATION_SUSPECT",
    status: "review",
    sourceStage: "audio",
    expected: expectedReading,
    observed: finding.heardReading,
    startSec: finding.startSec,
    endSec: finding.endSec,
    reason: finding.reason || "発音の不一致が検出されました",
  });

  if (geminiVerdict === "mismatch") {
    // STT mismatch + Gemini mismatch -> review. When STT saw no
    // difference, a finding needs audible evidence (a time range) AND
    // corroboration from the model's own transcript diff; heard readings
    // that only add jitter-sized noise (one inserted particle sound) are
    // dropped so a single hallucinated finding cannot flag a clean unit.
    let usable = findings;
    if (!sttHasDifferences) {
      const segments =
        normalizedKana !== null
          ? kanaDiffIssues(normalizedExpected, normalizedKana, [])
          : null;
      usable = findings.filter((finding, index) => {
        if (finding.startSec === null) return false;
        if (segments === null) return true;
        const heard = coveredReadings[index];
        return segments.some(
          (segment) =>
            segment.observed !== null && heard.includes(segment.observed),
        );
      });
    }
    if (usable.length > 0) {
      const issues = usable.map(toIssue);
      // The transcript diff may expose misreads Gemini did not list
      // (e.g. it reported one spot but heard two).
      if (normalizedKana !== null) {
        issues.push(
          ...kanaDiffIssues(normalizedExpected, normalizedKana, coveredReadings),
        );
      }
      return { status: "review", audioReview: issues };
    }
    // Every finding was uncorroborated noise while STT heard no
    // difference either -> the two ears agree the audio is fine.
    if (
      !sttHasDifferences &&
      normalizedKana !== null &&
      kanaDiffIssues(normalizedExpected, normalizedKana, []).length === 0
    ) {
      return { status: "pass", audioReview: [] };
    }
    // Mismatch without evidence -> inconclusive
    return {
      status: "inconclusive",
      audioReview: [
        {
          code: "ASR_GEMINI_CONFLICT",
          status: "inconclusive",
          sourceStage: "audio",
          expected: expectedReading,
          observed: observedReading,
          startSec: gemini.startSec,
          endSec: gemini.endSec,
          reason: "Geminiの判断に根拠が不足しています",
        },
      ],
    };
  }

  // Gemini says match. When STT saw no difference either, the unit passes.
  if (!sttHasDifferences) {
    return { status: "pass", audioReview: [] };
  }

  // STT saw a difference. Before declaring a conflict, check Gemini's own
  // as-heard transcript: when it also deviates from the expected reading,
  // the two ears actually agree and the verdict field simply missed it.
  if (normalizedKana !== null) {
    const corroborated = kanaDiffIssues(normalizedExpected, normalizedKana, []);
    if (corroborated.length > 0) {
      return { status: "review", audioReview: corroborated };
    }
  }

  // STT mismatch + Gemini match -> inconclusive (conflict)
  return {
    status: "inconclusive",
    audioReview: [
      {
        code: "ASR_GEMINI_CONFLICT",
        status: "inconclusive",
        sourceStage: "audio",
        expected: expectedReading,
        observed: observedReading,
        startSec: gemini.startSec,
        endSec: gemini.endSec,
        reason: "STTとGeminiの判断が一致しません",
      },
    ],
  };
}
