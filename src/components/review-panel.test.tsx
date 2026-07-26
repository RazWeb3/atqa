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
    humanResolved: false,
    onReview: vi.fn(),
    onSeek: vi.fn(),
    onMarkResolved: vi.fn(),
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

  it("shows progress status while reviewing", () => {
    render(<ReviewPanel {...defaultProps} isReviewing={true} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "検査を実行しています...",
    );
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

  it("displays expected and heard readings in Stage 2", () => {
    const review = createReviewResponse();
    render(<ReviewPanel {...defaultProps} review={review} />);

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

  it("calls onSeek with startSec when seek button clicked", async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    const review = createReviewResponse();
    render(<ReviewPanel {...defaultProps} review={review} onSeek={onSeek} />);

    await user.click(
      screen.getByRole("button", { name: /問題位置から再生/ }),
    );
    expect(onSeek).toHaveBeenCalledWith(1.5);
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

  it("shows resolve button for non-pass status", () => {
    const review = createReviewResponse({ status: "review" });
    render(<ReviewPanel {...defaultProps} review={review} />);

    expect(screen.getByTestId("resolve-btn")).toBeInTheDocument();
  });

  it("does not show resolve button for pass status", () => {
    const review = createReviewResponse({
      status: "pass",
      audioReview: [],
    });
    render(<ReviewPanel {...defaultProps} review={review} />);

    expect(screen.queryByTestId("resolve-btn")).not.toBeInTheDocument();
  });

  it("calls onMarkResolved when resolve button clicked", async () => {
    const user = userEvent.setup();
    const onMarkResolved = vi.fn();
    const review = createReviewResponse({ status: "review" });
    render(
      <ReviewPanel
        {...defaultProps}
        review={review}
        onMarkResolved={onMarkResolved}
      />,
    );

    await user.click(screen.getByTestId("resolve-btn"));
    expect(onMarkResolved).toHaveBeenCalledTimes(1);
  });

  it("shows resolved badge when humanResolved is true", () => {
    const review = createReviewResponse({ status: "review" });
    render(
      <ReviewPanel {...defaultProps} review={review} humanResolved={true} />,
    );

    expect(screen.getByTestId("resolved-badge")).toHaveTextContent(
      "✓ 確認済み",
    );
    expect(screen.queryByTestId("resolve-btn")).not.toBeInTheDocument();
  });

  it("human resolution does not change ReviewStatus display", () => {
    const review = createReviewResponse({ status: "review" });
    render(
      <ReviewPanel {...defaultProps} review={review} humanResolved={true} />,
    );

    // Status still shows 要確認 even though human resolved
    expect(screen.getByTestId("review-status")).toHaveTextContent("要確認");
    expect(screen.getByTestId("resolved-badge")).toBeInTheDocument();
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
});
