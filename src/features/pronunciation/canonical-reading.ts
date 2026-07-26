import dictionary from "@/data/pronunciation-dictionary.json";
import {
  katakanaToHiragana,
  normalizeComparisonKana,
  normalizeUnicode,
} from "./kana";
import { convertToReading } from "./reading-converter.server";

export type CanonicalReadingResult =
  | { status: "defined"; display: string; comparison: string }
  | { status: "undefined"; unknownTokens: string[] };

type Correction = { key: string; reading: string };

// Sort corrections by key length descending for longest-match-first
const corrections: Correction[] = Object.entries(dictionary.corrections)
  .map(([key, reading]) => ({ key, reading }))
  .sort((a, b) => b.key.length - a.key.length);

// Pattern to detect remaining Latin tokens after dictionary replacement
const LATIN_TOKEN_PATTERN = /[A-Za-z][A-Za-z0-9._-]*/g;

/**
 * Apply dictionary corrections to text using longest-match-first,
 * non-overlapping replacement.
 * Returns the text with replacements and a map of replaced ranges.
 */
function applyDictionaryCorrections(text: string): {
  result: string;
  replacedRanges: Array<{ start: number; end: number }>;
} {
  const normalized = normalizeUnicode(text);
  const replacedRanges: Array<{ start: number; end: number }> = [];
  let result = "";
  let position = 0;

  while (position < normalized.length) {
    let matched = false;

    for (const correction of corrections) {
      const key = correction.key;
      if (normalized.startsWith(key, position)) {
        // Check if this range overlaps with already replaced ranges
        const newRange = { start: position, end: position + key.length };
        const overlaps = replacedRanges.some(
          (range) =>
            newRange.start < range.end && newRange.end > range.start,
        );

        if (!overlaps) {
          result += correction.reading;
          replacedRanges.push(newRange);
          position += key.length;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      result += normalized[position];
      position++;
    }
  }

  return { result, replacedRanges };
}

/**
 * Check if a character is Japanese (hiragana, katakana, or kanji).
 */
function isJapanese(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 0x3040 && code <= 0x309f) || // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) || // Katakana
    (code >= 0x4e00 && code <= 0x9faf) || // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4dbf) // CJK Extension A
  );
}

/**
 * Extract non-replaced Japanese spans for morphological analysis.
 */
function extractJapaneseSpans(
  text: string,
  replacedRanges: Array<{ start: number; end: number }>,
): Array<{ text: string; start: number; end: number }> {
  const spans: Array<{ text: string; start: number; end: number }> = [];
  let currentSpan = "";
  let spanStart = -1;

  for (let i = 0; i < text.length; i++) {
    const isInReplacedRange = replacedRanges.some(
      (range) => i >= range.start && i < range.end,
    );

    if (!isInReplacedRange && isJapanese(text[i])) {
      if (spanStart === -1) {
        spanStart = i;
      }
      currentSpan += text[i];
    } else {
      if (currentSpan) {
        spans.push({ text: currentSpan, start: spanStart, end: i });
        currentSpan = "";
        spanStart = -1;
      }
    }
  }

  if (currentSpan) {
    spans.push({ text: currentSpan, start: spanStart, end: text.length });
  }

  return spans;
}

/**
 * Create a canonical reading from display text using dictionary corrections
 * and morphological analysis.
 */
export async function createCanonicalReading(
  displayText: string,
): Promise<CanonicalReadingResult> {
  // Step 1: Apply dictionary corrections
  const { replacedRanges } =
    applyDictionaryCorrections(displayText);

  // Step 2: Extract Japanese spans that weren't replaced
  const japaneseSpans = extractJapaneseSpans(displayText, replacedRanges);

  // Step 3: Convert Japanese spans to reading using kuromoji
  const spanReadings = new Map<number, string>();
  for (const span of japaneseSpans) {
    const reading = await convertToReading(span.text);
    spanReadings.set(span.start, reading);
  }

  // Step 4: Build the final reading
  let displayReading = "";
  let position = 0;
  const normalized = normalizeUnicode(displayText);

  while (position < normalized.length) {
    // Check if this position starts a dictionary correction
    const correction = corrections.find(
      (c) =>
        normalized.startsWith(c.key, position) &&
        replacedRanges.some(
          (r) => r.start === position && r.end === position + c.key.length,
        ),
    );

    if (correction) {
      displayReading += correction.reading;
      position += correction.key.length;
      continue;
    }

    // Check if this position starts a Japanese span
    const spanReading = spanReadings.get(position);
    if (spanReading !== undefined) {
      displayReading += spanReading;
      // Find the span to get its length
      const span = japaneseSpans.find((s) => s.start === position);
      if (span) {
        position += span.text.length;
        continue;
      }
    }

    // Skip non-Japanese characters (punctuation, etc.)
    displayReading += normalized[position];
    position++;
  }

  // Step 5: Check for remaining Latin tokens
  const latinMatches = displayReading.match(LATIN_TOKEN_PATTERN);
  if (latinMatches && latinMatches.length > 0) {
    return {
      status: "undefined",
      unknownTokens: [...new Set(latinMatches)],
    };
  }

  // Step 6: Convert to hiragana for display
  const displayHiragana = katakanaToHiragana(displayReading);

  // Step 7: Create comparison form (remove punctuation)
  const comparison = normalizeComparisonKana(displayHiragana);

  return {
    status: "defined",
    display: displayHiragana,
    comparison,
  };
}
