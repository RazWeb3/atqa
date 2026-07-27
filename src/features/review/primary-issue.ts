import type { ReviewIssue, ReviewResponse } from "./review-contract";

// Pick the issue shown as the always-visible summary. Deterministic rule:
// audio issues before synthesis issues, `review` before `inconclusive`,
// issues with a playable position before those without; ties keep the
// earlier issue.
export function selectPrimaryIssue(
  review: ReviewResponse,
): ReviewIssue | null {
  const candidates = [...review.audioReview, ...review.synthesisReview];
  if (candidates.length === 0) return null;

  const score = (issue: ReviewIssue): number =>
    (issue.status === "review" ? 2 : 0) + (issue.startSec !== null ? 1 : 0);

  return candidates.reduce(
    (best, current) => (score(current) > score(best) ? current : best),
    candidates[0],
  );
}
