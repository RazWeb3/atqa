"use client";

import { useEffect, useRef } from "react";
import type {
  ReviewIssue,
  ReviewResponse,
} from "@/features/review/review-contract";
import { selectPrimaryIssue } from "@/features/review/primary-issue";
import {
  ISSUE_CODE_LABELS,
  type HumanResolution,
} from "@/features/review/review-queue";

type ReviewPanelProps = {
  review: ReviewResponse | undefined;
  isReviewing: boolean;
  isQueued: boolean;
  failed: boolean;
  resolution: HumanResolution | null;
  // Triage navigation across units that still need human attention.
  actionableCount: number;
  actionableRank: number | null;
  onJumpActionable: (direction: 1 | -1) => void;
  onReview: () => void;
  onSeekAndPlay: (seconds: number) => void;
  onResolve: (resolution: HumanResolution) => void;
};

const STATUS_LABELS: Record<string, string> = {
  pass: "正常",
  review: "要確認",
  inconclusive: "判定不能",
};

const RESOLUTION_LABELS: Record<HumanResolution, string> = {
  confirmed_issue: "問題ありと確認",
  dismissed_issue: "誤検知として棄却",
};

// Gemini timestamps and MP3 seeking are both approximate, so start playback
// slightly before the reported position to keep the problem audible.
const SEEK_LEAD_IN_SEC = 0.5;

function SeekButton({
  issue,
  onSeekAndPlay,
}: {
  issue: ReviewIssue;
  onSeekAndPlay: (seconds: number) => void;
}) {
  if (issue.startSec === null) return null;
  return (
    <button
      type="button"
      onClick={() =>
        onSeekAndPlay(Math.max(0, issue.startSec! - SEEK_LEAD_IN_SEC))
      }
      className="btn btn-small btn-seek"
    >
      問題位置から再生
      {issue.endSec !== null &&
        ` (${issue.startSec.toFixed(1)}s–${issue.endSec.toFixed(1)}s)`}
      {issue.endSec === null && ` (${issue.startSec.toFixed(1)}s)`}
    </button>
  );
}

function IssueItem({
  issue,
  onSeekAndPlay,
}: {
  issue: ReviewIssue;
  onSeekAndPlay: (seconds: number) => void;
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
      <SeekButton issue={issue} onSeekAndPlay={onSeekAndPlay} />
    </li>
  );
}

export function ReviewPanel({
  review,
  isReviewing,
  isQueued,
  failed,
  resolution,
  actionableCount,
  actionableRank,
  onJumpActionable,
  onReview,
  onSeekAndPlay,
  onResolve,
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

  // Hide the issue summary for pass results: leftover stage issues (e.g.
  // an undefined-reading note from Stage 1) would only add noise there.
  const primaryIssue =
    review && review.status !== "pass" ? selectPrimaryIssue(review) : null;
  const busy = isReviewing || isQueued;
  // The jump buttons always move to another unit, so they are useless when
  // the current unit is the only actionable one.
  const canJump =
    actionableCount > (actionableRank !== null ? 1 : 0);

  return (
    <aside className="workspace-review" aria-label="AI検査パネル">
      <h3>AI検査</h3>

      {actionableCount > 0 && (
        <div className="triage-nav" data-testid="triage-nav">
          <span className="triage-count" data-testid="triage-count">
            {actionableRank !== null
              ? `要対応 ${actionableRank} / ${actionableCount}件`
              : `要対応 ${actionableCount}件`}
          </span>
          <div className="triage-buttons">
            <button
              type="button"
              onClick={() => onJumpActionable(-1)}
              disabled={!canJump}
              className="btn btn-secondary btn-small"
              data-testid="prev-actionable"
            >
              前の要対応
            </button>
            <button
              type="button"
              onClick={() => onJumpActionable(1)}
              disabled={!canJump}
              className="btn btn-secondary btn-small"
              data-testid="next-actionable"
            >
              次の要対応
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onReview}
        disabled={busy}
        className="btn btn-primary btn-review"
      >
        {isReviewing && "検査中..."}
        {isQueued && "検査待機中..."}
        {!busy && (review || failed ? "もう一度AI検査" : "この音声をAI検査")}
      </button>

      <div aria-live="polite">
        {isReviewing && (
          <p className="review-progress" role="status">
            検査を実行しています...
          </p>
        )}
      </div>

      {failed && !busy && (
        <p className="review-error" role="alert">
          AI検査に失敗しました。もう一度お試しください。
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

          {/* Primary issue: always-visible conclusion */}
          {primaryIssue && (
            <div className="primary-issue" data-testid="primary-issue">
              <p className="primary-issue-label">
                {ISSUE_CODE_LABELS[primaryIssue.code] || primaryIssue.code}
              </p>
              <p className="primary-issue-reason">{primaryIssue.reason}</p>
              <SeekButton issue={primaryIssue} onSeekAndPlay={onSeekAndPlay} />
            </div>
          )}

          {/* Human judgment - separate from AI verdict */}
          <div className="human-resolution">
            {resolution ? (
              <p
                className={`resolution-badge resolution-${resolution}`}
                data-testid="resolved-badge"
              >
                ✓ {RESOLUTION_LABELS[resolution]}
              </p>
            ) : (
              review.status !== "pass" && (
                <div className="resolution-actions">
                  <button
                    type="button"
                    onClick={() => onResolve("confirmed_issue")}
                    className="btn btn-secondary btn-small"
                    data-testid="confirm-issue-btn"
                  >
                    問題ありと確認
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolve("dismissed_issue")}
                    className="btn btn-secondary btn-small"
                    data-testid="dismiss-issue-btn"
                  >
                    誤検知として棄却
                  </button>
                </div>
              )
            )}
          </div>

          {/* Technical evidence, collapsed by default */}
          {(review.synthesisReview.length > 0 ||
            review.audioReview.length > 0 ||
            review.asrTranscript) && (
            <details className="review-details" data-testid="review-details">
              <summary>詳細な根拠を見る</summary>

              {/* Stage 1: Synthesis text QA */}
              {review.synthesisReview.length > 0 && (
                <div className="review-stage" data-testid="stage1">
                  <h5>Stage 1: 読み上げ原稿QA</h5>
                  <ul>
                    {review.synthesisReview.map((issue, i) => (
                      <IssueItem
                        key={`s1-${i}`}
                        issue={issue}
                        onSeekAndPlay={onSeekAndPlay}
                      />
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
                      <IssueItem
                        key={`s2-${i}`}
                        issue={issue}
                        onSeekAndPlay={onSeekAndPlay}
                      />
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
            </details>
          )}
        </div>
      )}
    </aside>
  );
}
