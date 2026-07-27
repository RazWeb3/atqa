"use client";

import { useEffect, useRef } from "react";
import type {
  ReviewIssue,
  ReviewResponse,
} from "@/features/review/review-contract";
import { selectPrimaryIssue } from "@/features/review/primary-issue";
import type { HumanResolution } from "@/features/review/review-queue";

type ReviewPanelProps = {
  review: ReviewResponse | undefined;
  isReviewing: boolean;
  isQueued: boolean;
  failed: boolean;
  resolution: HumanResolution | null;
  onReview: () => void;
  onSeekAndPlay: (seconds: number) => void;
  onResolve: (resolution: HumanResolution) => void;
};

const STATUS_LABELS: Record<string, string> = {
  pass: "正常",
  review: "要確認",
  inconclusive: "判定不能",
};

const ISSUE_CODE_LABELS: Record<string, string> = {
  SYNTHESIS_TEXT_MISMATCH: "原稿読みの不一致",
  AUDIO_PRONUNCIATION_SUSPECT: "発音の疑い",
  OMISSION_SUSPECT: "読み飛ばしの疑い",
  DUPLICATION_SUSPECT: "重複読みの疑い",
  UNDEFINED_READING: "読み未定義の語",
  LOW_ASR_CONFIDENCE: "音声認識の信頼度低",
  ASR_GEMINI_CONFLICT: "判定根拠の不一致",
  AUDIO_FETCH_FAILED: "音声取得の失敗",
  MODEL_OUTPUT_INVALID: "モデル出力の不正",
};

const RESOLUTION_LABELS: Record<HumanResolution, string> = {
  confirmed_issue: "問題ありと確認",
  dismissed_issue: "誤検知として棄却",
};

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
      onClick={() => onSeekAndPlay(issue.startSec!)}
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

  const primaryIssue = review ? selectPrimaryIssue(review) : null;
  const busy = isReviewing || isQueued;

  return (
    <aside className="workspace-review" aria-label="AI検査パネル">
      <h3>AI検査</h3>
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
