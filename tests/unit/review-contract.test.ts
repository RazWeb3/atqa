import { describe, expect, it } from "vitest";
import {
  GeminiReviewSchema,
  ReviewRequestSchema,
} from "@/features/review/review-contract";

describe("GeminiReviewSchema", () => {
  it("accepts valid match verdict", () => {
    const result = GeminiReviewSchema.safeParse({
      verdict: "match",
      heardReading: null,
      reason: "発音が期待読みと一致します",
      startSec: null,
      endSec: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid mismatch verdict with reading and time", () => {
    const result = GeminiReviewSchema.safeParse({
      verdict: "mismatch",
      heardReading: "いっと",
      reason: "ITが「イット」と発音されています",
      startSec: 1.5,
      endSec: 2.0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts inconclusive verdict", () => {
    const result = GeminiReviewSchema.safeParse({
      verdict: "inconclusive",
      heardReading: null,
      reason: "音声が不明瞭です",
      startSec: null,
      endSec: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown verdict", () => {
    const result = GeminiReviewSchema.safeParse({
      verdict: "unknown",
      heardReading: null,
      reason: "test",
      startSec: null,
      endSec: null,
    });
    expect(result.success).toBe(false);
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

  it("rejects missing required fields", () => {
    const result = GeminiReviewSchema.safeParse({
      verdict: "match",
    });
    expect(result.success).toBe(false);
  });
});

describe("ReviewRequestSchema", () => {
  it("accepts valid review request", () => {
    const result = ReviewRequestSchema.safeParse({
      unit: {
        id: "doc-1",
        groupId: "doc-1",
        kind: "document",
        order: 0,
        displayText: "ITプロジェクト",
        synthesisText: "アイティープロジェクト",
        expectedReading: null,
        audioUrl: "https://cdn.convly.jp/audio/test.mp3",
        sourcePath: "documents[0]",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid kind", () => {
    const result = ReviewRequestSchema.safeParse({
      unit: {
        id: "doc-1",
        groupId: "doc-1",
        kind: "invalid",
        order: 0,
        displayText: "test",
        synthesisText: null,
        expectedReading: null,
        audioUrl: "https://cdn.convly.jp/audio/test.mp3",
        sourcePath: "documents[0]",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid audio URL", () => {
    const result = ReviewRequestSchema.safeParse({
      unit: {
        id: "doc-1",
        groupId: "doc-1",
        kind: "document",
        order: 0,
        displayText: "test",
        synthesisText: null,
        expectedReading: null,
        audioUrl: "not-a-url",
        sourcePath: "documents[0]",
      },
    });
    expect(result.success).toBe(false);
  });
});
