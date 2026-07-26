"use client";

import { useEffect, useRef } from "react";
import type { ReviewResponse, ReviewIssue } from "@/features/review/review-contract";

type ReviewPanelProps = {
  review: ReviewResponse | undefined;
  isReviewing: boolean;
  error?: string | null;
  humanResolved: boolean;
  onReview: () => void;
  onSeek: (seconds: number) => void;
  onMarkResolved: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  pass: "正常",
  review: "要確認",
  inconclusive: "判定不能",
};

function IssueItem({
  issue,
  onSeek,
}: {
  issue: ReviewIssue;
  onSeek: (seconds: number) => void;
}) {
  return (
    <li className="review-issue-item">
      <code>{issue.code}</code>
      <span className="issue-reason">{issue.reason}</span>
      {issue.expected && (
        <span className="issue-detail">
          期待読み: <strong>{issue.expected}</strong>
        </span>
      )}
      {issue.observed && (
        <span className="issue-detail">
          認識結果: <strong>{issue.observed}</strong>
        </span>
      )}
      {issue.startSec !== null && (
        <button
          type="button"
          onClick={() => onSeek(issue.startSec!)}
          className="btn btn-small btn-seek"
        >
          問題位置から再生
          {issue.endSec !== null &&
            ` (${issue.startSec.toFixed(1)}s–${issue.endSec.toFixed(1)}s)`}
          {issue.endSec === null && ` (${issue.startSec.toFixed(1)}s)`}
        </button>
      )}
    </li>
  );
}

export function ReviewPanel({
  review,
  isReviewing,
  error = null,
  humanResolved,
  onReview,
  onSeek,
  onMarkResolved,
}: ReviewPanelProps) {
  const resultRef = useRef<HTMLHeadingElement>(null);
  const prevReviewingRef = useRef(false);

  // Focus result heading when review completes
  useEffect(() => {
    if (prevReviewingRef.current && !isReviewing && review) {
      resultRef.current?.focus();
    }
    prevReviewingRef.current = isReviewing;
  }, [isReviewing, review]);

  return (
    <aside className="workspace-review" aria-label="AI検査パネル">
      <h3>AI検査</h3>
      <button
        type="button"
        onClick={onReview}
        disabled={isReviewing}
        className="btn btn-primary btn-review"
      >
        {isReviewing ? "検査中..." : "この音声をAI検査"}
      </button>

      <div aria-live="polite">
        {isReviewing && (
          <p className="review-progress" role="status">
            検査を実行しています...
          </p>
        )}
      </div>

      {error && !isReviewing && (
        <p className="review-error" role="alert">
          {error}
        </p>
      )}

      {review && !isReviewing && (
        <div className="review-result">
          <h4 ref={resultRef} tabIndex={-1} className="review-result-heading">
            検査結果
          </h4>
          <p
            className={`review-status status-${review.status}`}
            data-testid="review-status"
          >
            {STATUS_LABELS[review.status] || review.status}
          </p>

          {/* Stage 1: Synthesis text QA */}
          {review.synthesisReview.length > 0 && (
            <div className="review-stage" data-testid="stage1">
              <h5>Stage 1: 読み上げ原稿QA</h5>
              <ul>
                {review.synthesisReview.map((issue, i) => (
                  <IssueItem key={`s1-${i}`} issue={issue} onSeek={onSeek} />
                ))}
              </ul>
            </div>
          )}

          {/* Stage 2: Audio QA */}
          {review.audioReview.length > 0 && (
            <div className="review-stage" data-testid="stage2">
              <h5>Stage 2: 実音声QA</h5>
              <ul>
                {review.audioReview.map((issue, i) => (
                  <IssueItem key={`s2-${i}`} issue={issue} onSeek={onSeek} />
                ))}
              </ul>
            </div>
          )}

          {/* ASR transcript evidence */}
          {review.asrTranscript && (
            <div className="review-transcript">
              <h5>音声認識結果</h5>
              <p data-testid="asr-transcript">{review.asrTranscript}</p>
              {review.asrConfidence !== null && (
                <p>
                  信頼度:{" "}
                  {(review.asrConfidence * 100).toFixed(1)}%
                </p>
              )}
            </div>
          )}

          {/* Human resolution - separate from AI verdict */}
          <div className="human-resolution">
            {humanResolved ? (
              <p className="resolution-badge" data-testid="resolved-badge">
                ✓ 確認済み
              </p>
            ) : (
              review.status !== "pass" && (
                <button
                  type="button"
                  onClick={onMarkResolved}
                  className="btn btn-secondary btn-small"
                  data-testid="resolve-btn"
                >
                  確認済みにする
                </button>
              )
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
