import { describe, expect, it } from "vitest";
import { parseContent } from "@/features/content/content-schema";
import { normalizeContent } from "@/features/content/normalize-content";
import documentFixture from "../fixtures/document.json";
import quizFixture from "../fixtures/quiz.json";

describe("normalizeContent", () => {
  describe("document", () => {
    it("normalizes document fixture to 42 units", () => {
      const content = parseContent(documentFixture);
      const result = normalizeContent(content);
      expect(result.units).toHaveLength(42);
    });

    it("sets correct content metadata", () => {
      const content = parseContent(documentFixture);
      const result = normalizeContent(content);
      expect(result.content.type).toBe("document");
      expect(result.content.groupCount).toBe(42);
      expect(result.content.unitCount).toBe(42);
    });

    it("creates correct unit structure", () => {
      const content = parseContent(documentFixture);
      const result = normalizeContent(content);
      const firstUnit = result.units[0];

      expect(firstUnit.id).toBe("doc-1");
      expect(firstUnit.groupId).toBe("doc-1");
      expect(firstUnit.kind).toBe("document");
      expect(firstUnit.order).toBe(0);
      expect(firstUnit.displayText).toContain("ITパスポート");
      expect(firstUnit.sourcePath).toBe("documents[0]");
    });

    it("builds correct CDN URL", () => {
      const content = parseContent(documentFixture);
      const result = normalizeContent(content);
      const firstUnit = result.units[0];

      expect(firstUnit.audioUrl).toBe(
        "https://cdn.convly.jp/sokqa/creators/sokqa_official/packs/cnt_938dda303d/objects/audio/av_20260721_225017_cnt_938dda303d_doc_01__doc_doc-1_020e6f59.mp3",
      );
    });

    it("captures synthesisText when present", () => {
      const content = parseContent(documentFixture);
      const result = normalizeContent(content);
      const firstUnit = result.units[0];

      expect(firstUnit.synthesisText).toContain("アイティー");
    });

    it("sets synthesisText to null when absent", () => {
      const content = parseContent(documentFixture);
      const result = normalizeContent(content);
      const secondUnit = result.units[1];

      expect(secondUnit.synthesisText).toBeNull();
    });

    it("initializes expectedReading to null", () => {
      const content = parseContent(documentFixture);
      const result = normalizeContent(content);

      result.units.forEach((unit) => {
        expect(unit.expectedReading).toBeNull();
      });
    });
  });

  describe("quiz", () => {
    it("normalizes quiz fixture to 30 groups and 180 units", () => {
      const content = parseContent(quizFixture);
      const result = normalizeContent(content);
      expect(result.content.groupCount).toBe(30);
      expect(result.units).toHaveLength(180);
    });

    it("creates units in correct order: question, choices, explanation", () => {
      const content = parseContent(quizFixture);
      const result = normalizeContent(content);
      const firstSixKinds = result.units.slice(0, 6).map((u) => u.kind);

      expect(firstSixKinds).toEqual([
        "question",
        "choice",
        "choice",
        "choice",
        "choice",
        "explanation",
      ]);
    });

    it("creates correct unit IDs", () => {
      const content = parseContent(quizFixture);
      const result = normalizeContent(content);

      expect(result.units[0].id).toBe("q-1:question");
      expect(result.units[1].id).toBe("q-1:choice:0");
      expect(result.units[2].id).toBe("q-1:choice:1");
      expect(result.units[3].id).toBe("q-1:choice:2");
      expect(result.units[4].id).toBe("q-1:choice:3");
      expect(result.units[5].id).toBe("q-1:explanation");
    });

    it("sets groupId to question ID", () => {
      const content = parseContent(quizFixture);
      const result = normalizeContent(content);

      result.units.slice(0, 6).forEach((unit) => {
        expect(unit.groupId).toBe("q-1");
      });
    });

    it("captures choiceTexts when present", () => {
      const content = parseContent(quizFixture);
      const result = normalizeContent(content);

      // q-1 has no choiceTexts
      expect(result.units[1].synthesisText).toBeNull();
    });

    it("sets correct sourcePath", () => {
      const content = parseContent(quizFixture);
      const result = normalizeContent(content);

      expect(result.units[0].sourcePath).toBe("questions[0]");
      expect(result.units[1].sourcePath).toBe("questions[0].choices[0]");
      expect(result.units[5].sourcePath).toBe("questions[0].explanation");
    });
  });
});
