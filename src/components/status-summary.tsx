"use client";

import type { ReviewResponse } from "@/features/review/review-contract";
import { selectPrimaryIssue } from "@/features/review/primary-issue";
import { ISSUE_CODE_LABELS } from "@/features/review/review-queue";

type StatusSummaryProps = {
  reviews: Record<string, ReviewResponse>;
  totalCount: number;
};

// Count inconclusive reviews by their primary issue code so the user can
// see *why* units could not be judged (e.g. missing dictionary entries vs
// low ASR confidence) instead of a single opaque number.
function buildInconclusiveBreakdown(
  reviews: ReviewResponse[],
): Array<{ code: string; count: number }> {
  const counts = new Map<string, number>();
  for (const review of reviews) {
    const code = selectPrimaryIssue(review)?.code ?? "UNKNOWN";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);
}

export function StatusSummary({ reviews, totalCount }: StatusSummaryProps) {
  const reviewValues = Object.values(reviews);

  const inspectedCount = reviewValues.length;
  const reviewCount = reviewValues.filter(
    (r) => r.status === "review",
  ).length;
  const inconclusiveReviews = reviewValues.filter(
    (r) => r.status === "inconclusive",
  );
  const breakdown = buildInconclusiveBreakdown(inconclusiveReviews);

  return (
    <div className="status-summary" aria-label="検査状況">
      <div className="status-items">
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
          <span className="status-value">{inconclusiveReviews.length}</span>
        </div>
      </div>
      {breakdown.length > 0 && (
        <p
          className="status-breakdown"
          data-testid="inconclusive-breakdown"
        >
          判定不能の内訳:{" "}
          {breakdown
            .map(
              ({ code, count }) =>
                `${ISSUE_CODE_LABELS[code] ?? code} ${count}`,
            )
            .join(" / ")}
        </p>
      )}
    </div>
  );
}
