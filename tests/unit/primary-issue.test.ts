import { describe, expect, it } from "vitest";
import { selectPrimaryIssue } from "@/features/review/primary-issue";
import type {
  ReviewIssue,
  ReviewResponse,
} from "@/features/review/review-contract";

function makeIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    code: "AUDIO_PRONUNCIATION_SUSPECT",
    status: "review",
    sourceStage: "audio",
    expected: "あいてぃー",
    observed: "いっと",
    startSec: 1.5,
    endSec: 2.3,
    reason: "発音の不一致が検出されました",
    ...overrides,
  };
}

function makeReview(
  overrides: Partial<ReviewResponse> = {},
): ReviewResponse {
  return {
    unitId: "doc-1",
    status: "review",
    synthesisReview: [],
    audioReview: [],
    asrTranscript: null,
    asrConfidence: null,
    ...overrides,
  };
}

describe("selectPrimaryIssue", () => {
  it("returns null when there are no issues", () => {
    expect(selectPrimaryIssue(makeReview())).toBeNull();
  });

  it("prefers review issues over inconclusive ones", () => {
    const inconclusive = makeIssue({
      code: "LOW_ASR_CONFIDENCE",
      status: "inconclusive",
      startSec: null,
      endSec: null,
    });
    const review = makeIssue({ status: "review" });
    const result = selectPrimaryIssue(
      makeReview({ audioReview: [inconclusive, review] }),
    );

    expect(result).toBe(review);
  });

  it("prefers issues with a playable position", () => {
    const withoutPosition = makeIssue({ startSec: null, endSec: null });
    const withPosition = makeIssue({ startSec: 3.0 });
    const result = selectPrimaryIssue(
      makeReview({ audioReview: [withoutPosition, withPosition] }),
    );

    expect(result).toBe(withPosition);
  });

  it("prefers audio issues over synthesis issues on equal score", () => {
    const synthesis = makeIssue({
      code: "SYNTHESIS_TEXT_MISMATCH",
      sourceStage: "synthesis_text",
    });
    const audio = makeIssue({ sourceStage: "audio" });
    const result = selectPrimaryIssue(
      makeReview({ synthesisReview: [synthesis], audioReview: [audio] }),
    );

    expect(result).toBe(audio);
  });

  it("keeps the earlier issue on complete ties", () => {
    const first = makeIssue({ reason: "1つ目" });
    const second = makeIssue({ reason: "2つ目" });
    const result = selectPrimaryIssue(
      makeReview({ audioReview: [first, second] }),
    );

    expect(result).toBe(first);
  });
});
