import type { ReviewResponse } from "./review-contract";

// Human judgment on a flagged unit. Kept separate from the AI verdict so the
// two are never conflated (design spec 13.5).
export type HumanResolution = "confirmed_issue" | "dismissed_issue";

// Transient run state of a unit inside the client-side review queue.
// Absence of an entry means the unit is idle (not queued / not failed).
export type UnitRunState = "queued" | "reviewing" | "failed";

export type ReviewQueueState = {
  runStates: Record<string, UnitRunState>;
  batchActive: boolean;
  batchTotal: number;
  batchDone: number;
};

export const initialReviewQueueState: ReviewQueueState = {
  runStates: {},
  batchActive: false,
  batchTotal: 0,
  batchDone: 0,
};

export type ReviewQueueEvent =
  | { type: "BATCH_START"; unitIds: string[] }
  | { type: "UNIT_START"; unitId: string }
  | { type: "UNIT_SUCCESS"; unitId: string }
  | { type: "UNIT_FAILURE"; unitId: string }
  | { type: "BATCH_CANCEL" }
  | { type: "BATCH_END" };

export function reviewQueueReducer(
  state: ReviewQueueState,
  event: ReviewQueueEvent,
): ReviewQueueState {
  switch (event.type) {
    case "BATCH_START": {
      const runStates = { ...state.runStates };
      for (const id of event.unitIds) {
        runStates[id] = "queued";
      }
      return {
        runStates,
        batchActive: true,
        batchTotal: event.unitIds.length,
        batchDone: 0,
      };
    }

    case "UNIT_START":
      return {
        ...state,
        runStates: { ...state.runStates, [event.unitId]: "reviewing" },
      };

    case "UNIT_SUCCESS": {
      const runStates = { ...state.runStates };
      delete runStates[event.unitId];
      return {
        ...state,
        runStates,
        batchDone: state.batchActive ? state.batchDone + 1 : state.batchDone,
      };
    }

    case "UNIT_FAILURE":
      return {
        ...state,
        runStates: { ...state.runStates, [event.unitId]: "failed" },
        batchDone: state.batchActive ? state.batchDone + 1 : state.batchDone,
      };

    case "BATCH_CANCEL": {
      // Drop queued units; in-flight reviews finish naturally.
      const runStates: Record<string, UnitRunState> = {};
      let dropped = 0;
      for (const [id, runState] of Object.entries(state.runStates)) {
        if (runState === "queued") {
          dropped++;
        } else {
          runStates[id] = runState;
        }
      }
      return {
        ...state,
        runStates,
        batchTotal: state.batchTotal - dropped,
      };
    }

    case "BATCH_END":
      return {
        ...state,
        batchActive: false,
        batchTotal: 0,
        batchDone: 0,
      };

    default:
      return state;
  }
}

// Display status of a unit combining run state and review result.
export type UnitDisplayStatus =
  | "unreviewed"
  | "queued"
  | "reviewing"
  | "failed"
  | "pass"
  | "review"
  | "inconclusive";

export const UNIT_STATUS_LABELS: Record<UnitDisplayStatus, string> = {
  unreviewed: "未検査",
  queued: "待機",
  reviewing: "検査中",
  failed: "失敗",
  pass: "正常",
  review: "要確認",
  inconclusive: "判定不能",
};

export function deriveUnitStatus(
  runState: UnitRunState | undefined,
  review: ReviewResponse | undefined,
): UnitDisplayStatus {
  if (runState) return runState;
  if (review) return review.status;
  return "unreviewed";
}

// A unit needs human attention when the AI flagged it (or the review
// failed) and no human judgment has been recorded yet.
export function isActionable(
  status: UnitDisplayStatus,
  resolution: HumanResolution | null,
): boolean {
  if (resolution) return false;
  return status === "review" || status === "inconclusive" || status === "failed";
}
