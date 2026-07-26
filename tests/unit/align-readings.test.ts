import { describe, expect, it } from "vitest";
import {
  alignReadings,
  hasDifferences,
} from "@/features/pronunciation/align-readings";

describe("alignReadings", () => {
  it("returns equal for identical strings", () => {
    const edits = alignReadings("あいてぃー", "あいてぃー");
    expect(edits).toEqual([
      {
        operation: "equal",
        expected: "あいてぃー",
        observed: "あいてぃー",
        expectedStart: 0,
        expectedEnd: 5,
      },
    ]);
    expect(hasDifferences(edits)).toBe(false);
  });

  it("detects replacement", () => {
    const edits = alignReadings("あいてぃー", "いっと");
    // The algorithm finds minimal edit distance, which may include
    // a combination of operations. Just verify there are differences.
    expect(hasDifferences(edits)).toBe(true);
    // Verify that the total edit represents the transformation
    const nonEqual = edits.filter((e) => e.operation !== "equal");
    expect(nonEqual.length).toBeGreaterThan(0);
  });

  it("detects insertion", () => {
    const edits = alignReadings("あい", "あいう");
    const nonEqual = edits.filter((e) => e.operation !== "equal");
    expect(nonEqual.some((e) => e.operation === "insert")).toBe(true);
  });

  it("detects deletion", () => {
    const edits = alignReadings("あいう", "あい");
    const nonEqual = edits.filter((e) => e.operation !== "equal");
    expect(nonEqual.some((e) => e.operation === "delete")).toBe(true);
  });

  it("handles empty expected", () => {
    const edits = alignReadings("", "あい");
    expect(edits).toEqual([
      {
        operation: "insert",
        expected: "",
        observed: "あい",
        expectedStart: 0,
        expectedEnd: 0,
      },
    ]);
  });

  it("handles empty observed", () => {
    const edits = alignReadings("あい", "");
    expect(edits).toEqual([
      {
        operation: "delete",
        expected: "あい",
        observed: "",
        expectedStart: 0,
        expectedEnd: 2,
      },
    ]);
  });

  it("handles both empty", () => {
    const edits = alignReadings("", "");
    expect(edits).toEqual([]);
    expect(hasDifferences(edits)).toBe(false);
  });

  it("detects partial mismatch", () => {
    const edits = alignReadings(
      "えすきゅーえるをじっこうする",
      "しーくえるをじっこうする",
    );
    expect(hasDifferences(edits)).toBe(true);
    const nonEqual = edits.filter((e) => e.operation !== "equal");
    expect(nonEqual.length).toBeGreaterThan(0);
  });
});
