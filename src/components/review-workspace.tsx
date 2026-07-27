"use client";

import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import type {
  NormalizedContent,
  PlaybackUnit,
} from "@/features/content/types";
import type { ReviewResponse } from "@/features/review/review-contract";
import {
  deriveUnitStatus,
  findAdjacentActionable,
  initialReviewQueueState,
  isActionable,
  reviewQueueReducer,
  type HumanResolution,
  type UnitDisplayStatus,
} from "@/features/review/review-queue";
import { useContinuousPlayer } from "@/features/audio/use-continuous-player";
import { SectionNav } from "./section-nav";
import { TransportControls } from "./transport-controls";
import { StatusSummary } from "./status-summary";
import { ReviewPanel } from "./review-panel";

type ReviewWorkspaceProps = {
  content: NormalizedContent;
  onReset: () => void;
};

// Run up to this many review requests at once. STT + Gemini takes several
// seconds per unit, so a small amount of parallelism keeps batches usable
// without hammering the API.
const BATCH_CONCURRENCY = 2;

// crypto.randomUUID is unavailable in non-secure contexts (e.g. LAN IP over
// http), so fall back to a random URL-safe key.
function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join("");
}

export function ReviewWorkspace({ content, onReset }: ReviewWorkspaceProps) {
  const { units } = content;
  const player = useContinuousPlayer(units);
  const [reviews, setReviews] = useState<Record<string, ReviewResponse>>({});
  const [humanResolutions, setHumanResolutions] = useState<
    Record<string, HumanResolution>
  >({});
  const [queueState, dispatchQueue] = useReducer(
    reviewQueueReducer,
    initialReviewQueueState,
  );
  // Set to true to stop workers from picking up queued units.
  const batchCancelRef = useRef(false);

  const selectedUnit = units[player.state.unitIndex];

  const reviewUnit = useCallback(async (unit: PlaybackUnit) => {
    dispatchQueue({ type: "UNIT_START", unitId: unit.id });
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createIdempotencyKey(),
        },
        body: JSON.stringify({ unit }),
      });

      if (response.ok) {
        const result = await response.json();
        setReviews((prev) => ({ ...prev, [unit.id]: result }));
        dispatchQueue({ type: "UNIT_SUCCESS", unitId: unit.id });
      } else {
        dispatchQueue({ type: "UNIT_FAILURE", unitId: unit.id });
      }
    } catch {
      dispatchQueue({ type: "UNIT_FAILURE", unitId: unit.id });
    }
  }, []);

  const handleReviewSelected = useCallback(() => {
    if (!selectedUnit) return;
    if (queueState.runStates[selectedUnit.id] === "reviewing") return;
    if (queueState.runStates[selectedUnit.id] === "queued") return;
    void reviewUnit(selectedUnit);
  }, [selectedUnit, queueState.runStates, reviewUnit]);

  const runBatch = useCallback(
    async (targets: PlaybackUnit[]) => {
      if (queueState.batchActive || targets.length === 0) return;

      batchCancelRef.current = false;
      dispatchQueue({
        type: "BATCH_START",
        unitIds: targets.map((u) => u.id),
      });

      const pending = [...targets];
      const worker = async () => {
        while (!batchCancelRef.current) {
          const unit = pending.shift();
          if (!unit) return;
          await reviewUnit(unit);
        }
      };

      await Promise.all(
        Array.from({ length: BATCH_CONCURRENCY }, () => worker()),
      );
      dispatchQueue({ type: "BATCH_END" });
    },
    [queueState.batchActive, reviewUnit],
  );

  // Batch targets: units never reviewed successfully (includes failures).
  const batchTargets = useMemo(
    () => units.filter((unit) => !reviews[unit.id]),
    [units, reviews],
  );

  const failedTargets = useMemo(
    () =>
      units.filter((unit) => queueState.runStates[unit.id] === "failed"),
    [units, queueState.runStates],
  );

  const handleBatchStart = useCallback(() => {
    void runBatch(batchTargets);
  }, [runBatch, batchTargets]);

  const handleBatchCancel = useCallback(() => {
    batchCancelRef.current = true;
    dispatchQueue({ type: "BATCH_CANCEL" });
  }, []);

  const handleRetryFailed = useCallback(() => {
    void runBatch(failedTargets);
  }, [runBatch, failedTargets]);

  const handleResolve = useCallback(
    (resolution: HumanResolution) => {
      if (!selectedUnit) return;
      setHumanResolutions((prev) => ({
        ...prev,
        [selectedUnit.id]: resolution,
      }));
    },
    [selectedUnit],
  );

  // Per-unit display status for the nav and the panel.
  const statusByUnitId = useMemo(() => {
    const map: Record<string, UnitDisplayStatus> = {};
    for (const unit of units) {
      map[unit.id] = deriveUnitStatus(
        queueState.runStates[unit.id],
        reviews[unit.id],
      );
    }
    return map;
  }, [units, queueState.runStates, reviews]);

  const actionableByUnitId = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const unit of units) {
      map[unit.id] = isActionable(
        statusByUnitId[unit.id],
        humanResolutions[unit.id] ?? null,
      );
    }
    return map;
  }, [units, statusByUnitId, humanResolutions]);

  // Triage navigation: jump between units that still need human attention.
  const actionableFlags = useMemo(
    () => units.map((unit) => actionableByUnitId[unit.id]),
    [units, actionableByUnitId],
  );

  const actionableCount = useMemo(
    () => actionableFlags.filter(Boolean).length,
    [actionableFlags],
  );

  // 1-based position of the selected unit among actionable ones, or null
  // when the selected unit itself is not actionable.
  const actionableRank = useMemo(() => {
    if (!actionableFlags[player.state.unitIndex]) return null;
    let rank = 0;
    for (let i = 0; i <= player.state.unitIndex; i++) {
      if (actionableFlags[i]) rank++;
    }
    return rank;
  }, [actionableFlags, player.state.unitIndex]);

  const handleJumpActionable = useCallback(
    (direction: 1 | -1) => {
      const target = findAdjacentActionable(
        actionableFlags,
        player.state.unitIndex,
        direction,
      );
      if (target !== null) player.select(target);
    },
    [actionableFlags, player],
  );

  const currentReview = selectedUnit ? reviews[selectedUnit.id] : undefined;
  const currentRunState = selectedUnit
    ? queueState.runStates[selectedUnit.id]
    : undefined;
  const currentResolution = selectedUnit
    ? (humanResolutions[selectedUnit.id] ?? null)
    : null;

  return (
    <div className="review-workspace">
      <header className="workspace-header">
        <div className="workspace-title">
          <p className="workspace-brand">ATQA</p>
          <h2>{content.content.title}</h2>
          <p>
            {content.content.type === "document"
              ? `${content.content.groupCount}セクション`
              : `${content.content.groupCount}問`}
            {" / "}
            {content.content.unitCount}ユニット
          </p>
        </div>
        <StatusSummary reviews={reviews} totalCount={units.length} />
        <div className="workspace-actions">
          {queueState.batchActive ? (
            <>
              <span
                className="batch-progress"
                role="status"
                data-testid="batch-progress"
              >
                検査中 {queueState.batchDone} / {queueState.batchTotal}
              </span>
              <button
                type="button"
                onClick={handleBatchCancel}
                className="btn btn-secondary"
                data-testid="batch-cancel"
              >
                キャンセル
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleBatchStart}
                disabled={batchTargets.length === 0}
                className="btn btn-primary"
                data-testid="batch-start"
              >
                未検査を一括AI検査
              </button>
              {failedTargets.length > 0 && (
                <button
                  type="button"
                  onClick={handleRetryFailed}
                  className="btn btn-secondary"
                  data-testid="batch-retry"
                >
                  失敗分を再試行 ({failedTargets.length})
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={onReset}
            className="btn btn-secondary"
          >
            別のファイルを読み込む
          </button>
        </div>
      </header>

      <div className="workspace-body">
        <aside className="workspace-nav">
          <SectionNav
            units={units}
            selectedIndex={player.state.unitIndex}
            onSelect={player.select}
            statusByUnitId={statusByUnitId}
            actionableByUnitId={actionableByUnitId}
          />
        </aside>

        <main className="workspace-main">
          {selectedUnit && (
            <article className="unit-display">
              <h3>表示本文</h3>
              <p className="unit-text">{selectedUnit.displayText}</p>

              {selectedUnit.synthesisText && (
                <>
                  <h4>音声生成用テキスト</h4>
                  <p className="unit-synthesis">
                    {selectedUnit.synthesisText}
                  </p>
                </>
              )}
            </article>
          )}
        </main>

        <ReviewPanel
          review={currentReview}
          isReviewing={currentRunState === "reviewing"}
          isQueued={currentRunState === "queued"}
          failed={currentRunState === "failed"}
          resolution={currentResolution}
          actionableCount={actionableCount}
          actionableRank={actionableRank}
          onJumpActionable={handleJumpActionable}
          onReview={handleReviewSelected}
          onSeekAndPlay={player.seekAndPlay}
          onResolve={handleResolve}
        />
      </div>

      <div className="transport-dock">
        <TransportControls
          state={player.state}
          unitCount={units.length}
          onPlay={player.play}
          onPause={player.pause}
          onPrevious={player.previous}
          onNext={player.next}
          onToggleContinuous={() =>
            player.setContinuous(!player.state.continuous)
          }
        />
      </div>
    </div>
  );
}
