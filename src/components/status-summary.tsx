"use client";

import type { ReviewResponse } from "@/features/review/review-contract";

type StatusSummaryProps = {
  reviews: Record<string, ReviewResponse>;
  totalCount: number;
};

export function StatusSummary({ reviews, totalCount }: StatusSummaryProps) {
  const reviewValues = Object.values(reviews);

  const inspectedCount = reviewValues.length;
  const reviewCount = reviewValues.filter(
    (r) => r.status === "review",
  ).length;
  const inconclusiveCount = reviewValues.filter(
    (r) => r.status === "inconclusive",
  ).length;

  return (
    <div className="status-summary" aria-label="検査状況">
      <div className="status-item">
        <span className="status-label">検査済み</span>
        <span className="status-value">
          {inspectedCount}
          <span className="status-total"> / {totalCount}</span>
        </span>
      </div>
      <div className="status-item status-review">
        <span className="status-label">要確認</span>
        <span className="status-value">{reviewCount}</span>
      </div>
      <div className="status-item status-inconclusive">
        <span className="status-label">判定不能</span>
        <span className="status-value">{inconclusiveCount}</span>
      </div>
    </div>
  );
}
