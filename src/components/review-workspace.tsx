"use client";

import { useCallback, useState } from "react";
import type {
  NormalizedContent,
} from "@/features/content/types";
import type { ReviewResponse } from "@/features/review/review-contract";
import { useContinuousPlayer } from "@/features/audio/use-continuous-player";
import { SectionNav } from "./section-nav";
import { TransportControls } from "./transport-controls";
import { StatusSummary } from "./status-summary";
import { ReviewPanel } from "./review-panel";

type ReviewWorkspaceProps = {
  content: NormalizedContent;
  onReset: () => void;
};

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
  const [humanResolutions, setHumanResolutions] = useState<Record<string, boolean>>({});
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const selectedUnit = units[player.state.unitIndex];

  const handleReview = useCallback(async () => {
    if (!selectedUnit || isReviewing) return;

    setIsReviewing(true);
    setReviewError(null);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": createIdempotencyKey(),
        },
        body: JSON.stringify({ unit: selectedUnit }),
      });

      const result = await response.json();

      if (response.ok) {
        setReviews((prev) => ({
          ...prev,
          [selectedUnit.id]: result,
        }));
      } else {
        setReviewError("AI検査に失敗しました。もう一度お試しください。");
      }
    } catch {
      setReviewError("AI検査の送信に失敗しました。接続を確認してもう一度お試しください。");
    } finally {
      setIsReviewing(false);
    }
  }, [selectedUnit, isReviewing]);

  const currentReview = selectedUnit ? reviews[selectedUnit.id] : undefined;
  const currentResolved = selectedUnit ? (humanResolutions[selectedUnit.id] ?? false) : false;

  const handleMarkResolved = useCallback(() => {
    if (!selectedUnit) return;
    setHumanResolutions((prev) => ({
      ...prev,
      [selectedUnit.id]: true,
    }));
  }, [selectedUnit]);

  return (
    <div className="review-workspace">
      <header className="workspace-header">
        <div className="workspace-title">
          <h2>{content.content.title}</h2>
          <p>
            {content.content.type === "document"
              ? `${content.content.groupCount}セクション`
              : `${content.content.groupCount}問`}
            {" / "}
            {content.content.unitCount}ユニット
          </p>
        </div>
        <StatusSummary reviews={reviews} />
        <button
          type="button"
          onClick={onReset}
          className="btn btn-secondary"
        >
          別のファイルを読み込む
        </button>
      </header>

      <div className="workspace-body">
        <aside className="workspace-nav">
          <SectionNav
            units={units}
            selectedIndex={player.state.unitIndex}
            onSelect={player.select}
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
            </article>
          )}
        </main>

        <ReviewPanel
          review={currentReview}
          isReviewing={isReviewing}
          error={reviewError}
          humanResolved={currentResolved}
          onReview={handleReview}
          onSeek={player.seek}
          onMarkResolved={handleMarkResolved}
        />
      </div>
    </div>
  );
}
