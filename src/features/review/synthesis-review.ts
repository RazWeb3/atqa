import type { PlaybackUnit } from "@/features/content/types";
import {
  alignReadings,
  hasDifferences,
} from "@/features/pronunciation/align-readings";
import { createCanonicalReading } from "@/features/pronunciation/canonical-reading";
import { normalizeComparisonKana } from "@/features/pronunciation/kana";
import { convertToReading } from "@/features/pronunciation/reading-converter.server";
import type { ReviewIssue, StageReview } from "./review-contract";

/**
 * Convert synthesis text to comparison kana.
 * Synthesis text may contain kanji, so we need to convert it to reading.
 */
async function synthesizeTextToComparisonKana(
  synthesisText: string,
): Promise<string> {
  // First convert any kanji to reading
  const reading = await convertToReading(synthesisText);
  // Then normalize to comparison form
  return normalizeComparisonKana(reading);
}

/**
 * Stage 1: Review synthesis text against expected reading.
 * This is a deterministic check that does not call external APIs.
 */
export async function reviewSynthesisText(
  unit: PlaybackUnit,
  extraCorrections?: Record<string, string>,
): Promise<StageReview> {
  // If no synthesis text, skip Stage 1
  if (!unit.synthesisText) {
    return { status: "not_recorded", issues: [] };
  }

  // Get canonical reading from display text
  const canonical = await createCanonicalReading(
    unit.displayText,
    extraCorrections,
  );

  // If canonical reading is undefined, return inconclusive
  if (canonical.status === "undefined") {
    const issue: ReviewIssue = {
      code: "UNDEFINED_READING",
      status: "inconclusive",
      sourceStage: "synthesis_text",
      expected: null,
      observed: null,
      startSec: null,
      endSec: null,
      reason: `期待読みが未定義です: ${canonical.unknownTokens.join(", ")}`,
      tokens: canonical.unknownTokens,
    };
    return { status: "inconclusive", issues: [issue] };
  }

  // Normalize synthesis text for comparison (convert kanji to reading)
  const synthesisComparison = await synthesizeTextToComparisonKana(
    unit.synthesisText,
  );
  const expectedComparison = canonical.comparison;

  // Align the readings
  const edits = alignReadings(expectedComparison, synthesisComparison);

  // If no differences, synthesis text matches expected reading
  if (!hasDifferences(edits)) {
    return { status: "pass", issues: [] };
  }

  // Build issue from differences
  const diffEdits = edits.filter((e) => e.operation !== "equal");
  const expectedParts = diffEdits.map((e) => e.expected).join("");
  const observedParts = diffEdits.map((e) => e.observed).join("");

  const issue: ReviewIssue = {
    code: "SYNTHESIS_TEXT_MISMATCH",
    status: "review",
    sourceStage: "synthesis_text",
    expected: expectedParts || null,
    observed: observedParts || null,
    startSec: null,
    endSec: null,
    reason: `読み上げ原稿が期待読みと一致しません。期待: ${expectedComparison}、実際: ${synthesisComparison}`,
  };

  return { status: "review", issues: [issue] };
}
