import { describe, expect, it, vi, beforeEach } from "vitest";
import { reviewUnit } from "@/features/review/review-orchestrator.server";
import type { PlaybackUnit } from "@/features/content/types";
import type { GeminiReview } from "@/features/review/review-contract";
import type { AudioFetchResult } from "@/features/audio/audio-fetcher.server";
import type { SpeechWord } from "@/features/review/speech-recognizer.server";
import type { WhitelistEntry } from "@/features/review/reading-whitelist";

function createUnit(overrides: Partial<PlaybackUnit> = {}): PlaybackUnit {
  return {
    id: "doc-1",
    groupId: "doc-1",
    kind: "document",
    order: 0,
    displayText: "ITプロジェクト",
    synthesisText: null,
    expectedReading: null,
    audioUrl: "https://cdn.convly.jp/audio/test.mp3",
    sourcePath: "documents[0]",
    ...overrides,
  };
}

type DepsOptions = {
  confidence?: number;
  transcript?: string;
  words?: SpeechWord[];
  whitelist?: WhitelistEntry[];
};

function createDeps(gemini: GeminiReview, options: DepsOptions = {}) {
  const {
    confidence = 0.95,
    transcript = "アイティープロジェクト",
    words = [],
    whitelist = [],
  } = options;
  const fetchAudio = vi.fn(async (): Promise<AudioFetchResult> => ({
    body: new ArrayBuffer(8),
    contentType: "audio/mpeg",
    contentLength: 8,
    status: 200,
    contentRange: null,
  }));
  const recognizeSpeech = vi.fn(async () => ({
    transcript,
    confidence,
    words,
  }));
  const reviewAudioWithGemini = vi.fn(async () => gemini);
  const loadWhitelist = vi.fn(async () => whitelist);
  return { fetchAudio, recognizeSpeech, reviewAudioWithGemini, loadWhitelist };
}

describe("reviewUnit assumed-reading mode (unknown tokens)", () => {
  beforeEach(() => {
    process.env.ASR_CONFIDENCE_THRESHOLD = "0.75";
  });

  // "Unknown" is word-like (mixed case), so no deterministic reading exists.
  const unknownUnit = () => createUnit({ displayText: "Unknownツール" });

  it("passes unknown tokens to Gemini instead of bailing out", async () => {
    const deps = createDeps({
      verdict: "match",
      heardReading: null,
      reason: "慣用読みとして自然です",
      startSec: null,
      endSec: null,
    });

    const result = await reviewUnit(unknownUnit(), deps);

    expect(deps.reviewAudioWithGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        unknownTokens: ["Unknown"],
        candidateEdits: [],
      }),
    );
    expect(result.status).toBe("pass");
    expect(result.audioReview).toHaveLength(0);
  });

  it("returns review when Gemini reports a mismatch with evidence", async () => {
    const deps = createDeps({
      verdict: "mismatch",
      heardReading: "うんくのうん",
      reason: "不自然な読みです",
      startSec: 0.4,
      endSec: 1.1,
    });

    const result = await reviewUnit(unknownUnit(), deps);

    expect(result.status).toBe("review");
    expect(result.audioReview[0]).toMatchObject({
      code: "AUDIO_PRONUNCIATION_SUSPECT",
      status: "review",
      observed: "うんくのうん",
      startSec: 0.4,
    });
    expect(result.audioReview[0].reason).toContain("AI推定読みでの判定");
  });

  it("returns inconclusive when Gemini cannot judge", async () => {
    const deps = createDeps({
      verdict: "inconclusive",
      heardReading: null,
      reason: "読みを確定できません",
      startSec: null,
      endSec: null,
    });

    const result = await reviewUnit(unknownUnit(), deps);

    expect(result.status).toBe("inconclusive");
    expect(result.audioReview[0].code).toBe("UNDEFINED_READING");
    expect(result.audioReview[0].reason).toContain("Unknown");
  });

  it("still gates on low STT confidence before calling Gemini", async () => {
    const deps = createDeps(
      {
        verdict: "match",
        heardReading: null,
        reason: "",
        startSec: null,
        endSec: null,
      },
      { confidence: 0.4 },
    );

    const result = await reviewUnit(unknownUnit(), deps);

    expect(result.status).toBe("inconclusive");
    expect(result.audioReview[0].code).toBe("LOW_ASR_CONFIDENCE");
    expect(deps.reviewAudioWithGemini).not.toHaveBeenCalled();
  });
});

describe("reviewUnit deterministic mode (defined reading)", () => {
  it("keeps the STT + Gemini double check for defined readings", async () => {
    const deps = createDeps({
      verdict: "match",
      heardReading: null,
      reason: "一致しています",
      startSec: null,
      endSec: null,
    });

    const result = await reviewUnit(createUnit(), deps);

    expect(deps.reviewAudioWithGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedReading: "あいてぃーぷろじぇくと",
        unknownTokens: null,
      }),
    );
    expect(result.status).toBe("pass");
  });
});

describe("reviewUnit unclear-word detection (word-level confidence)", () => {
  const matchGemini: GeminiReview = {
    verdict: "match",
    heardReading: null,
    reason: "一致しています",
    startSec: null,
    endSec: null,
  };

  it("upgrades a passing unit to review when a low-confidence word exists", async () => {
    const deps = createDeps(matchGemini, {
      words: [
        { text: "プロジェクト", confidence: 0.35, startSec: 1.0, endSec: 2.0 },
      ],
    });

    const result = await reviewUnit(createUnit(), deps);

    expect(result.status).toBe("review");
    expect(result.audioReview[0]).toMatchObject({
      code: "AUDIO_UNCLEAR_SUSPECT",
      status: "review",
      observed: "プロジェクト",
      startSec: 1.0,
      endSec: 2.0,
    });
    expect(result.audioReview[0].reason).toContain("0.35");
  });

  it("keeps a pass verdict when every word is confident", async () => {
    const deps = createDeps(matchGemini, {
      words: [
        { text: "プロジェクト", confidence: 0.92, startSec: 1.0, endSec: 2.0 },
      ],
    });

    const result = await reviewUnit(createUnit(), deps);

    expect(result.status).toBe("pass");
    expect(result.audioReview).toHaveLength(0);
  });

  it("suppresses unclear words already approved in the whitelist", async () => {
    const deps = createDeps(matchGemini, {
      words: [{ text: "ホゲ", confidence: 0.35, startSec: 1.0, endSec: 2.0 }],
      whitelist: [
        // Katakana word must match the hiragana reading after normalization.
        { token: "hoge", reading: "ほげ", addedAt: "2026-07-27T00:00:00.000Z" },
      ],
    });

    const result = await reviewUnit(createUnit(), deps);

    expect(result.status).toBe("pass");
    expect(result.audioReview).toHaveLength(0);
  });

  it("attaches unclear-word spans to the low-confidence gate result", async () => {
    const deps = createDeps(matchGemini, {
      confidence: 0.4,
      words: [{ text: "ホゲ", confidence: 0.35, startSec: 1.0, endSec: 2.0 }],
    });

    const result = await reviewUnit(createUnit(), deps);

    expect(result.status).toBe("inconclusive");
    expect(result.audioReview[0].code).toBe("LOW_ASR_CONFIDENCE");
    expect(result.audioReview[1]).toMatchObject({
      code: "AUDIO_UNCLEAR_SUSPECT",
      observed: "ホゲ",
    });
  });
});

describe("reviewUnit whitelist overlay (approved readings)", () => {
  it("resolves unknown tokens deterministically via the whitelist", async () => {
    const deps = createDeps(
      {
        verdict: "match",
        heardReading: null,
        reason: "一致しています",
        startSec: null,
        endSec: null,
      },
      {
        transcript: "あんのうんつーる",
        whitelist: [
          {
            token: "Unknown",
            reading: "あんのうん",
            addedAt: "2026-07-27T00:00:00.000Z",
          },
        ],
      },
    );

    const result = await reviewUnit(
      createUnit({ displayText: "Unknownツール" }),
      deps,
    );

    // The overlay defines the reading, so assumed-reading mode is not needed.
    expect(deps.reviewAudioWithGemini).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedReading: "あんのうんつーる",
        unknownTokens: null,
      }),
    );
    expect(result.status).toBe("pass");
  });
});
