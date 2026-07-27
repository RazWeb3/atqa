import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewPanel } from "./review-panel";
import type { ReviewResponse } from "@/features/review/review-contract";

function createReviewResponse(
  overrides: Partial<ReviewResponse> = {},
): ReviewResponse {
  return {
    unitId: "doc-1",
    status: "review",
    synthesisReview: [],
    audioReview: [
      {
        code: "AUDIO_PRONUNCIATION_SUSPECT",
        status: "review",
        sourceStage: "audio",
        expected: "あいてぃー",
        observed: "いっと",
        startSec: 1.5,
        endSec: 2.3,
        reason: "発音の不一致が検出されました",
      },
    ],
    asrTranscript: "イットプロジェクト",
    asrConfidence: 0.92,
    ...overrides,
  };
}

describe("ReviewPanel", () => {
  const defaultProps = {
    review: undefined as ReviewResponse | undefined,
    isReviewing: false,
    isQueued: false,
    failed: false,
    resolution: null,
    actionableCount: 0,
    actionableRank: null as number | null,
    onJumpActionable: vi.fn(),
    onReview: vi.fn(),
    onSeekAndPlay: vi.fn(),
    onResolve: vi.fn(),
  };

  it("renders review button", () => {
    render(<ReviewPanel {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "この音声をAI検査" }),
    ).toBeInTheDocument();
  });

  it("disables button while reviewing", () => {
    render(<ReviewPanel {...defaultProps} isReviewing={true} />);
    const button = screen.getByRole("button", { name: "検査中..." });
    expect(button).toBeDisabled();
  });

  it("disables button while queued", () => {
    render(<ReviewPanel {...defaultProps} isQueued={true} />);
    const button = screen.getByRole("button", { name: "検査待機中..." });
    expect(button).toBeDisabled();
  });

  it("shows progress status while reviewing", () => {
    render(<ReviewPanel {...defaultProps} isReviewing={true} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "検査を実行しています...",
    );
  });

  it("shows failure alert with retry label when failed", () => {
    render(<ReviewPanel {...defaultProps} failed={true} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "AI検査に失敗しました",
    );
    expect(
      screen.getByRole("button", { name: "もう一度AI検査" }),
    ).toBeInTheDocument();
  });

  it("calls onReview when button clicked", async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    render(<ReviewPanel {...defaultProps} onReview={onReview} />);

    await user.click(
      screen.getByRole("button", { name: "この音声をAI検査" }),
    );
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("shows review status with correct label for review", () => {
    const review = createReviewResponse({ status: "review" });
    render(<ReviewPanel {...defaultProps} review={review} />);

    const status = screen.getByTestId("review-status");
    expect(status).toHaveTextContent("要確認");
    expect(status).toHaveClass("status-review");
  });

  it("shows pass status with correct label", () => {
    const review = createReviewResponse({
      status: "pass",
      audioReview: [],
    });
    render(<ReviewPanel {...defaultProps} review={review} />);

    const status = screen.getByTestId("review-status");
    expect(status).toHaveTextContent("正常");
    expect(status).toHaveClass("status-pass");
  });

  it("shows inconclusive status with correct label and never uses normal style", () => {
    const review = createReviewResponse({
      status: "inconclusive",
      audioReview: [
        {
          code: "LOW_ASR_CONFIDENCE",
          status: "inconclusive",
          sourceStage: "audio",
          expected: "あいてぃー",
          observed: null,
          startSec: null,
          endSec: null,
          reason: "音声認識の信頼度が低いです",
        },
      ],
    });
    render(<ReviewPanel {...defaultProps} review={review} />);

    const status = screen.getByTestId("review-status");
    expect(status).toHaveTextContent("判定不能");
    expect(status).toHaveClass("status-inconclusive");
    expect(status).not.toHaveClass("status-pass");
  });

  it("shows the primary issue summary with a readable label", () => {
    const review = createReviewResponse();
    render(<ReviewPanel {...defaultProps} review={review} />);

    const primary = screen.getByTestId("primary-issue");
    expect(primary).toHaveTextContent("発音の疑い");
    expect(primary).toHaveTextContent("発音の不一致が検出されました");
  });

  it("displays expected and heard readings inside the details section", () => {
    const review = createReviewResponse();
    render(<ReviewPanel {...defaultProps} review={review} />);

    expect(screen.getByTestId("review-details")).toBeInTheDocument();
    expect(screen.getByText("Stage 2: 実音声QA")).toBeInTheDocument();
    expect(screen.getByText("あいてぃー")).toBeInTheDocument();
    expect(screen.getByText("いっと")).toBeInTheDocument();
  });

  it("displays Stage 1 and Stage 2 separately", () => {
    const review = createReviewResponse({
      synthesisReview: [
        {
          code: "SYNTHESIS_TEXT_MISMATCH",
          status: "review",
          sourceStage: "synthesis_text",
          expected: "あいてぃー",
          observed: "アイティー",
          startSec: null,
          endSec: null,
          reason: "読み上げ原稿に問題があります",
        },
      ],
    });
    render(<ReviewPanel {...defaultProps} review={review} />);

    expect(screen.getByTestId("stage1")).toBeInTheDocument();
    expect(screen.getByTestId("stage2")).toBeInTheDocument();
    expect(screen.getByText("Stage 1: 読み上げ原稿QA")).toBeInTheDocument();
    expect(screen.getByText("Stage 2: 実音声QA")).toBeInTheDocument();
  });

  it("calls onSeekAndPlay with startSec when the primary seek button is clicked", async () => {
    const user = userEvent.setup();
    const onSeekAndPlay = vi.fn();
    const review = createReviewResponse();
    render(
      <ReviewPanel
        {...defaultProps}
        review={review}
        onSeekAndPlay={onSeekAndPlay}
      />,
    );

    // Primary summary and details both expose the button; use the first.
    const buttons = screen.getAllByRole("button", {
      name: /問題位置から再生/,
    });
    await user.click(buttons[0]);
    expect(onSeekAndPlay).toHaveBeenCalledWith(1.5);
  });

  it("does not show seek button when startSec is null", () => {
    const review = createReviewResponse({
      audioReview: [
        {
          code: "LOW_ASR_CONFIDENCE",
          status: "inconclusive",
          sourceStage: "audio",
          expected: null,
          observed: null,
          startSec: null,
          endSec: null,
          reason: "音声認識の信頼度が低いです",
        },
      ],
    });
    render(<ReviewPanel {...defaultProps} review={review} />);

    expect(
      screen.queryByRole("button", { name: /問題位置から再生/ }),
    ).not.toBeInTheDocument();
  });

  it("shows ASR transcript and confidence", () => {
    const review = createReviewResponse();
    render(<ReviewPanel {...defaultProps} review={review} />);

    expect(screen.getByTestId("asr-transcript")).toHaveTextContent(
      "イットプロジェクト",
    );
    expect(screen.getByText(/92\.0%/)).toBeInTheDocument();
  });

  it("shows both judgment buttons for non-pass status", () => {
    const review = createReviewResponse({ status: "review" });
    render(<ReviewPanel {...defaultProps} review={review} />);

    expect(screen.getByTestId("confirm-issue-btn")).toBeInTheDocument();
    expect(screen.getByTestId("dismiss-issue-btn")).toBeInTheDocument();
  });

  it("does not show judgment buttons for pass status", () => {
    const review = createReviewResponse({
      status: "pass",
      audioReview: [],
    });
    render(<ReviewPanel {...defaultProps} review={review} />);

    expect(screen.queryByTestId("confirm-issue-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dismiss-issue-btn")).not.toBeInTheDocument();
  });

  it("calls onResolve with confirmed_issue when confirm button clicked", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    const review = createReviewResponse({ status: "review" });
    render(
      <ReviewPanel {...defaultProps} review={review} onResolve={onResolve} />,
    );

    await user.click(screen.getByTestId("confirm-issue-btn"));
    expect(onResolve).toHaveBeenCalledWith("confirmed_issue");
  });

  it("calls onResolve with dismissed_issue when dismiss button clicked", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();
    const review = createReviewResponse({ status: "review" });
    render(
      <ReviewPanel {...defaultProps} review={review} onResolve={onResolve} />,
    );

    await user.click(screen.getByTestId("dismiss-issue-btn"));
    expect(onResolve).toHaveBeenCalledWith("dismissed_issue");
  });

  it("shows resolution badge when a judgment has been recorded", () => {
    const review = createReviewResponse({ status: "review" });
    render(
      <ReviewPanel
        {...defaultProps}
        review={review}
        resolution="confirmed_issue"
      />,
    );

    expect(screen.getByTestId("resolved-badge")).toHaveTextContent(
      "✓ 問題ありと確認",
    );
    expect(screen.queryByTestId("confirm-issue-btn")).not.toBeInTheDocument();
  });

  it("human judgment does not change ReviewStatus display", () => {
    const review = createReviewResponse({ status: "review" });
    render(
      <ReviewPanel
        {...defaultProps}
        review={review}
        resolution="dismissed_issue"
      />,
    );

    // Status still shows 要確認 even though a human judgment exists
    expect(screen.getByTestId("review-status")).toHaveTextContent("要確認");
    expect(screen.getByTestId("resolved-badge")).toHaveTextContent(
      "✓ 誤検知として棄却",
    );
  });

  it("has no quality score anywhere", () => {
    const review = createReviewResponse();
    const { container } = render(
      <ReviewPanel {...defaultProps} review={review} />,
    );

    expect(container.textContent).not.toContain("スコア");
    expect(container.textContent).not.toContain("score");
    expect(container.textContent).not.toContain("品質");
  });

  it("hides the triage nav when nothing is actionable", () => {
    render(<ReviewPanel {...defaultProps} actionableCount={0} />);
    expect(screen.queryByTestId("triage-nav")).not.toBeInTheDocument();
  });

  it("shows the actionable count and rank of the selected unit", () => {
    render(
      <ReviewPanel
        {...defaultProps}
        actionableCount={15}
        actionableRank={3}
      />,
    );
    expect(screen.getByTestId("triage-count")).toHaveTextContent(
      "要対応 3 / 15件",
    );
  });

  it("shows only the count when the selected unit is not actionable", () => {
    render(
      <ReviewPanel
        {...defaultProps}
        actionableCount={15}
        actionableRank={null}
      />,
    );
    expect(screen.getByTestId("triage-count")).toHaveTextContent(
      "要対応 15件",
    );
  });

  it("calls onJumpActionable with the direction", async () => {
    const user = userEvent.setup();
    const onJumpActionable = vi.fn();
    render(
      <ReviewPanel
        {...defaultProps}
        actionableCount={15}
        actionableRank={3}
        onJumpActionable={onJumpActionable}
      />,
    );

    await user.click(screen.getByTestId("next-actionable"));
    expect(onJumpActionable).toHaveBeenCalledWith(1);

    await user.click(screen.getByTestId("prev-actionable"));
    expect(onJumpActionable).toHaveBeenCalledWith(-1);
  });

  it("disables jump buttons when the selected unit is the only actionable one", () => {
    render(
      <ReviewPanel
        {...defaultProps}
        actionableCount={1}
        actionableRank={1}
      />,
    );
    expect(screen.getByTestId("next-actionable")).toBeDisabled();
    expect(screen.getByTestId("prev-actionable")).toBeDisabled();
  });
});
