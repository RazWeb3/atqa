import { describe, expect, it } from "vitest";
import {
  deriveUnitStatus,
  findAdjacentActionable,
  initialReviewQueueState,
  isActionable,
  reviewQueueReducer,
  type ReviewQueueState,
} from "@/features/review/review-queue";
import type { ReviewResponse } from "@/features/review/review-contract";

function makeReview(status: ReviewResponse["status"]): ReviewResponse {
  return {
    unitId: "doc-1",
    status,
    synthesisReview: [],
    audioReview: [],
    asrTranscript: null,
    asrConfidence: null,
  };
}

describe("reviewQueueReducer", () => {
  it("BATCH_START queues all target units and activates the batch", () => {
    const state = reviewQueueReducer(initialReviewQueueState, {
      type: "BATCH_START",
      unitIds: ["a", "b", "c"],
    });

    expect(state.batchActive).toBe(true);
    expect(state.batchTotal).toBe(3);
    expect(state.batchDone).toBe(0);
    expect(state.runStates).toEqual({
      a: "queued",
      b: "queued",
      c: "queued",
    });
  });

  it("UNIT_START marks the unit as reviewing", () => {
    let state = reviewQueueReducer(initialReviewQueueState, {
      type: "BATCH_START",
      unitIds: ["a"],
    });
    state = reviewQueueReducer(state, { type: "UNIT_START", unitId: "a" });

    expect(state.runStates.a).toBe("reviewing");
  });

  it("UNIT_SUCCESS clears the run state and advances progress", () => {
    let state = reviewQueueReducer(initialReviewQueueState, {
      type: "BATCH_START",
      unitIds: ["a", "b"],
    });
    state = reviewQueueReducer(state, { type: "UNIT_START", unitId: "a" });
    state = reviewQueueReducer(state, { type: "UNIT_SUCCESS", unitId: "a" });

    expect(state.runStates.a).toBeUndefined();
    expect(state.batchDone).toBe(1);
  });

  it("UNIT_FAILURE keeps the unit as failed and advances progress", () => {
    let state = reviewQueueReducer(initialReviewQueueState, {
      type: "BATCH_START",
      unitIds: ["a"],
    });
    state = reviewQueueReducer(state, { type: "UNIT_START", unitId: "a" });
    state = reviewQueueReducer(state, { type: "UNIT_FAILURE", unitId: "a" });

    expect(state.runStates.a).toBe("failed");
    expect(state.batchDone).toBe(1);
  });

  it("single-unit review outside a batch does not advance batch progress", () => {
    let state: ReviewQueueState = initialReviewQueueState;
    state = reviewQueueReducer(state, { type: "UNIT_START", unitId: "a" });
    state = reviewQueueReducer(state, { type: "UNIT_SUCCESS", unitId: "a" });

    expect(state.batchDone).toBe(0);
    expect(state.batchActive).toBe(false);
  });

  it("BATCH_CANCEL drops queued units but keeps in-flight and failed ones", () => {
    let state = reviewQueueReducer(initialReviewQueueState, {
      type: "BATCH_START",
      unitIds: ["a", "b", "c", "d"],
    });
    state = reviewQueueReducer(state, { type: "UNIT_START", unitId: "a" });
    state = reviewQueueReducer(state, { type: "UNIT_START", unitId: "b" });
    state = reviewQueueReducer(state, { type: "UNIT_FAILURE", unitId: "b" });
    state = reviewQueueReducer(state, { type: "BATCH_CANCEL" });

    expect(state.runStates).toEqual({ a: "reviewing", b: "failed" });
    // Two queued units dropped from the total
    expect(state.batchTotal).toBe(2);
  });

  it("BATCH_END deactivates the batch and resets counters", () => {
    let state = reviewQueueReducer(initialReviewQueueState, {
      type: "BATCH_START",
      unitIds: ["a"],
    });
    state = reviewQueueReducer(state, { type: "UNIT_START", unitId: "a" });
    state = reviewQueueReducer(state, { type: "UNIT_SUCCESS", unitId: "a" });
    state = reviewQueueReducer(state, { type: "BATCH_END" });

    expect(state.batchActive).toBe(false);
    expect(state.batchTotal).toBe(0);
    expect(state.batchDone).toBe(0);
  });
});

describe("deriveUnitStatus", () => {
  it("prefers the run state over the review result", () => {
    expect(deriveUnitStatus("reviewing", makeReview("pass"))).toBe(
      "reviewing",
    );
    expect(deriveUnitStatus("failed", undefined)).toBe("failed");
  });

  it("falls back to the review status", () => {
    expect(deriveUnitStatus(undefined, makeReview("review"))).toBe("review");
    expect(deriveUnitStatus(undefined, makeReview("pass"))).toBe("pass");
  });

  it("returns unreviewed when nothing is known", () => {
    expect(deriveUnitStatus(undefined, undefined)).toBe("unreviewed");
  });
});

describe("isActionable", () => {
  it("flags review, inconclusive, and failed units", () => {
    expect(isActionable("review", null)).toBe(true);
    expect(isActionable("inconclusive", null)).toBe(true);
    expect(isActionable("failed", null)).toBe(true);
  });

  it("does not flag pass, unreviewed, or in-flight units", () => {
    expect(isActionable("pass", null)).toBe(false);
    expect(isActionable("unreviewed", null)).toBe(false);
    expect(isActionable("queued", null)).toBe(false);
    expect(isActionable("reviewing", null)).toBe(false);
  });

  it("clears the flag once a human judgment is recorded", () => {
    expect(isActionable("review", "confirmed_issue")).toBe(false);
    expect(isActionable("review", "dismissed_issue")).toBe(false);
  });
});

describe("findAdjacentActionable", () => {
  //            0      1     2      3     4
  const flags = [false, true, false, true, false];

  it("finds the next actionable unit going forward", () => {
    expect(findAdjacentActionable(flags, 0, 1)).toBe(1);
    expect(findAdjacentActionable(flags, 1, 1)).toBe(3);
  });

  it("finds the previous actionable unit going backward", () => {
    expect(findAdjacentActionable(flags, 3, -1)).toBe(1);
    expect(findAdjacentActionable(flags, 4, -1)).toBe(3);
  });

  it("wraps around the list in both directions", () => {
    expect(findAdjacentActionable(flags, 4, 1)).toBe(1);
    expect(findAdjacentActionable(flags, 0, -1)).toBe(3);
  });

  it("excludes the current index so repeated jumps always move", () => {
    const single = [false, true, false];
    expect(findAdjacentActionable(single, 1, 1)).toBeNull();
    expect(findAdjacentActionable(single, 1, -1)).toBeNull();
  });

  it("returns null when nothing is actionable", () => {
    expect(findAdjacentActionable([false, false], 0, 1)).toBeNull();
    expect(findAdjacentActionable([], 0, 1)).toBeNull();
  });
});
