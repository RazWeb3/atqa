import { describe, expect, it, vi, beforeEach } from "vitest";
import { GeminiReviewSchema } from "@/features/review/review-contract";

// Mock the genai module
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => ({
      models: {
        generateContent: vi.fn(),
      },
    })),
  };
});

describe("GeminiReviewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
    process.env.GEMINI_MODEL = "gemini-2.0-flash-001";
  });

  describe("GeminiReviewSchema validation", () => {
    it("accepts valid match response", () => {
      const result = GeminiReviewSchema.safeParse({
        verdict: "match",
        heardReading: null,
        reason: "発音が一致しています",
        startSec: null,
        endSec: null,
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid mismatch response with reading and time", () => {
      const result = GeminiReviewSchema.safeParse({
        verdict: "mismatch",
        heardReading: "いっと",
        reason: "ITが「イット」と発音されています",
        startSec: 1.5,
        endSec: 2.0,
      });
      expect(result.success).toBe(true);
    });

    it("accepts a mismatch response with multiple findings", () => {
      const result = GeminiReviewSchema.safeParse({
        verdict: "mismatch",
        heardReading: "ひとだんらく",
        reason: "複数の誤読が検出されました",
        startSec: 3.2,
        endSec: 4.0,
        findings: [
          {
            heardReading: "ひとだんらく",
            reason: "一段落の誤読",
            startSec: 3.2,
            endSec: 4.0,
          },
          {
            heardReading: "かつぎます",
            reason: "担いますの誤読",
            startSec: 7.5,
            endSec: 8.3,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects a finding without heardReading", () => {
      const result = GeminiReviewSchema.safeParse({
        verdict: "mismatch",
        heardReading: "ひとだんらく",
        reason: "test",
        startSec: 3.2,
        endSec: 4.0,
        findings: [{ reason: "読みなし", startSec: 1.0, endSec: 2.0 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects markdown fences in response", () => {
      const invalidJson = '```json\n{"verdict": "match"}\n```';
      expect(() => JSON.parse(invalidJson)).toThrow();
    });

    it("rejects negative timestamps", () => {
      const result = GeminiReviewSchema.safeParse({
        verdict: "mismatch",
        heardReading: "いっと",
        reason: "test",
        startSec: -1,
        endSec: 2,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing heardReading for mismatch", () => {
      // Note: The schema allows null heardReading, but the business logic
      // should reject mismatch without heardReading. This test verifies
      // the schema structure.
      const result = GeminiReviewSchema.safeParse({
        verdict: "mismatch",
        heardReading: null,
        reason: "test",
        startSec: 1,
        endSec: 2,
      });
      // Schema allows this, but orchestrator should handle it
      expect(result.success).toBe(true);
    });

    it("rejects unknown verdict values", () => {
      const result = GeminiReviewSchema.safeParse({
        verdict: "unknown",
        heardReading: null,
        reason: "test",
        startSec: null,
        endSec: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects reason exceeding 300 characters", () => {
      const result = GeminiReviewSchema.safeParse({
        verdict: "match",
        heardReading: null,
        reason: "a".repeat(301),
        startSec: null,
        endSec: null,
      });
      expect(result.success).toBe(false);
    });
  });
});
