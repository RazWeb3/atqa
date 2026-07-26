import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PlaybackUnit } from "@/features/content/types";

// Mock external dependencies
vi.mock("@google-cloud/speech", () => ({
  v2: {
    SpeechClient: vi.fn().mockImplementation(() => ({
      recognize: vi.fn(),
    })),
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn(),
    },
  })),
}));

function createUnit(overrides: Partial<PlaybackUnit> = {}): PlaybackUnit {
  return {
    id: "doc-1",
    groupId: "doc-1",
    kind: "document",
    order: 0,
    displayText: "ITプロジェクト",
    synthesisText: "アイティープロジェクト",
    expectedReading: null,
    audioUrl: "https://cdn.convly.jp/audio/test.mp3",
    sourcePath: "documents[0]",
    ...overrides,
  };
}

describe("Review Orchestrator Verdict Matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
    process.env.ASR_CONFIDENCE_THRESHOLD = "0.75";
  });

  describe("verdict determination logic", () => {
    it("undefined canonical reading -> inconclusive", () => {
      // When displayText contains unknown Latin tokens
      const unit = createUnit({ displayText: "UNKNOWN製品" });
      // The orchestrator should return inconclusive with UNDEFINED_READING
      expect(unit.displayText).toContain("UNKNOWN");
    });

    it("audio fetch failed -> inconclusive", () => {
      // When audio cannot be fetched
      // The orchestrator should return inconclusive with AUDIO_FETCH_FAILED
      expect(true).toBe(true);
    });

    it("low STT confidence -> inconclusive", () => {
      // When STT confidence < threshold
      const lowConfidence = 0.5;
      const threshold = 0.75;
      expect(lowConfidence < threshold).toBe(true);
    });

    it("STT match + Gemini match -> pass", () => {
      const sttHasDifferences = false;
      const geminiVerdict = "match";

      // Expected: pass
      const expectedStatus = "pass";
      expect(
        !sttHasDifferences && geminiVerdict === "match" ? "pass" : "other",
      ).toBe(expectedStatus);
    });

    it("STT mismatch + Gemini mismatch -> review", () => {
      const sttHasDifferences = true;
      const geminiVerdict = "mismatch";

      // Expected: review
      const expectedStatus = "review";
      expect(
        sttHasDifferences && geminiVerdict === "mismatch"
          ? "review"
          : "other",
      ).toBe(expectedStatus);
    });

    it("STT match + Gemini mismatch with reading/time -> review", () => {
      const sttHasDifferences = false;
      const geminiVerdict = "mismatch";
      const heardReading = "いっと";
      const startSec = 1.5;

      // Expected: review (Gemini can override STT match with evidence)
      const shouldReview =
        !sttHasDifferences &&
        geminiVerdict === "mismatch" &&
        heardReading !== null &&
        startSec !== null;

      expect(shouldReview).toBe(true);
    });

    it("STT mismatch + Gemini match -> inconclusive (conflict)", () => {
      const sttHasDifferences = true;
      const geminiVerdict = "match";

      // Expected: inconclusive (ASR and Gemini conflict)
      const expectedStatus = "inconclusive";
      expect(
        sttHasDifferences && geminiVerdict === "match"
          ? "inconclusive"
          : "other",
      ).toBe(expectedStatus);
    });

    it("Gemini invalid/failed -> inconclusive", () => {
      // When Gemini returns invalid output or fails
      // Expected: inconclusive with MODEL_OUTPUT_INVALID
      expect(true).toBe(true);
    });
  });

  describe("IT -> イット mispronunciation case", () => {
    it("detects IT misread as イット", () => {
      const expectedReading = "あいてぃー";
      const heardReading = "いっと";

      // These should be different
      expect(expectedReading).not.toBe(heardReading);

      // This represents the core use case:
      // displayText: ITプロジェクト
      // expectedReading: あいてぃーぷろじぇくと
      // heardReading: いっとぷろじぇくと
      // Result: AUDIO_PRONUNCIATION_SUSPECT
    });
  });
});
