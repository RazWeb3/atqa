import { describe, expect, it } from "vitest";
import { reviewSynthesisText } from "@/features/review/synthesis-review";
import type { PlaybackUnit } from "@/features/content/types";

function createUnit(overrides: Partial<PlaybackUnit> = {}): PlaybackUnit {
  return {
    id: "test-unit",
    groupId: "test-group",
    kind: "document",
    order: 0,
    displayText: "SQLを実行する",
    synthesisText: "シークエルを実行する",
    expectedReading: null,
    audioUrl: "https://cdn.convly.jp/audio/test.mp3",
    sourcePath: "documents[0]",
    ...overrides,
  };
}

describe("reviewSynthesisText", () => {
  it("detects SYNTHESIS_TEXT_MISMATCH for SQL vs シークエル", async () => {
    const unit = createUnit({
      displayText: "SQLを実行する",
      synthesisText: "シークエルを実行する",
    });

    const result = await reviewSynthesisText(unit);

    expect(result.status).toBe("review");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe("SYNTHESIS_TEXT_MISMATCH");
    expect(result.issues[0].sourceStage).toBe("synthesis_text");
  });

  it("returns pass for matching synthesis text", async () => {
    const unit = createUnit({
      displayText: "SQLを実行する",
      synthesisText: "エスキューエルを実行する",
    });

    const result = await reviewSynthesisText(unit);

    expect(result.status).toBe("pass");
    expect(result.issues).toHaveLength(0);
  });

  it("returns not_recorded when synthesisText is null", async () => {
    const unit = createUnit({
      synthesisText: null,
    });

    const result = await reviewSynthesisText(unit);

    expect(result.status).toBe("not_recorded");
    expect(result.issues).toHaveLength(0);
  });

  it("returns inconclusive for undefined canonical reading", async () => {
    const unit = createUnit({
      displayText: "Unknown製品",
      synthesisText: "アンノウン製品",
    });

    const result = await reviewSynthesisText(unit);

    expect(result.status).toBe("inconclusive");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe("UNDEFINED_READING");
  });

  it("handles IT correctly", async () => {
    const unit = createUnit({
      displayText: "ITプロジェクト",
      synthesisText: "アイティープロジェクト",
    });

    const result = await reviewSynthesisText(unit);

    expect(result.status).toBe("pass");
  });
});
