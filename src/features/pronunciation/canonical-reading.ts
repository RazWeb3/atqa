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
const baseCorrections: Correction[] = Object.entries(dictionary.corrections)
  .map(([key, reading]) => ({ key, reading }))
  .sort((a, b) => b.key.length - a.key.length);

/**
 * Merge extra corrections (e.g. the human-approved reading whitelist) over
 * the base dictionary. Extra entries win on key collisions.
 */
function buildCorrections(
  extraCorrections?: Record<string, string>,
): Correction[] {
  if (!extraCorrections || Object.keys(extraCorrections).length === 0) {
    return baseCorrections;
  }
  const merged: Record<string, string> = {
    ...dictionary.corrections,
    ...extraCorrections,
  };
  return Object.entries(merged)
    .map(([key, reading]) => ({ key, reading }))
    .sort((a, b) => b.key.length - a.key.length);
}

// Pattern to detect remaining Latin tokens after dictionary replacement
const LATIN_TOKEN_PATTERN = /[A-Za-z][A-Za-z0-9._-]*/g;

// All-caps tokens (optionally with digits) are read out letter by letter,
// which is the standard Japanese convention for IT acronyms (PDCA, WBS,
// KPI...). Word-like tokens (Java, IoT) are excluded because letterwise
// reading would be wrong for them.
const ACRONYM_PATTERN = /^[A-Z][A-Z0-9]*$/;

const LETTER_READINGS: Record<string, string> = {
  A: "エー",
  B: "ビー",
  C: "シー",
  D: "ディー",
  E: "イー",
  F: "エフ",
  G: "ジー",
  H: "エイチ",
  I: "アイ",
  J: "ジェー",
  K: "ケー",
  L: "エル",
  M: "エム",
  N: "エヌ",
  O: "オー",
  P: "ピー",
  Q: "キュー",
  R: "アール",
  S: "エス",
  T: "ティー",
  U: "ユー",
  V: "ブイ",
  W: "ダブリュー",
  X: "エックス",
  Y: "ワイ",
  Z: "ゼット",
  "0": "ゼロ",
  "1": "ワン",
  "2": "ツー",
  "3": "スリー",
  "4": "フォー",
  "5": "ファイブ",
  "6": "シックス",
  "7": "セブン",
  "8": "エイト",
  "9": "ナイン",
};

function spellOutAcronym(token: string): string {
  return [...token].map((char) => LETTER_READINGS[char] ?? char).join("");
}

/**
 * Apply dictionary corrections to text using longest-match-first,
 * non-overlapping replacement.
 * Returns the text with replacements and a map of replaced ranges.
 */
function applyDictionaryCorrections(
  text: string,
  corrections: Correction[],
): {
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
 * Build a katakana-mixed reading of the text: dictionary corrections,
 * kuromoji for Japanese spans, letterwise spelling for all-caps acronyms.
 * Word-like Latin tokens the pipeline cannot read are left as-is.
 */
async function buildDictionaryReading(
  text: string,
  corrections: Correction[],
): Promise<string> {
  // Step 1: Apply dictionary corrections
  const { replacedRanges } = applyDictionaryCorrections(text, corrections);

  // Step 2: Extract Japanese spans that weren't replaced
  const japaneseSpans = extractJapaneseSpans(text, replacedRanges);

  // Step 3: Convert Japanese spans to reading using kuromoji
  const spanReadings = new Map<number, string>();
  for (const span of japaneseSpans) {
    const reading = await convertToReading(span.text);
    spanReadings.set(span.start, reading);
  }

  // Step 4: Build the final reading
  let displayReading = "";
  let position = 0;
  const normalized = normalizeUnicode(text);

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

  // Step 5: Spell out all-caps acronyms that the dictionary did not cover
  return displayReading.replace(LATIN_TOKEN_PATTERN, (token) =>
    ACRONYM_PATTERN.test(token) ? spellOutAcronym(token) : token,
  );
}

/**
 * Create a canonical reading from display text using dictionary corrections
 * and morphological analysis.
 */
export async function createCanonicalReading(
  displayText: string,
  extraCorrections?: Record<string, string>,
): Promise<CanonicalReadingResult> {
  const corrections = buildCorrections(extraCorrections);

  const displayReading = await buildDictionaryReading(displayText, corrections);

  // Check for remaining (word-like) Latin tokens
  const latinMatches = displayReading.match(LATIN_TOKEN_PATTERN);
  if (latinMatches && latinMatches.length > 0) {
    return {
      status: "undefined",
      unknownTokens: [...new Set(latinMatches)],
    };
  }

  // Convert to hiragana for display
  const displayHiragana = katakanaToHiragana(displayReading);

  // Create comparison form (remove punctuation)
  const comparison = normalizeComparisonKana(displayHiragana);

  return {
    status: "defined",
    display: displayHiragana,
    comparison,
  };
}

/**
 * Best-effort comparison reading for STT transcripts. Unlike
 * createCanonicalReading it never fails on unknown Latin tokens: the same
 * dictionary + kuromoji + letterwise-acronym pipeline is applied so that
 * transcripts like "AI検査" align with the letterwise expected reading
 * instead of producing spurious diffs.
 */

// Cloud STT writes spelled-out kana back as digits and Latin words
// (「えーてぃーきゅーえー」 -> "at 9 A", 「ごけんち」 -> "5 検知"), which
// would flag every spelled-out acronym as different. Standalone digits
// are expanded to their spoken reading; 9 uses キュー so it lines up
// with the letterwise reading of Q.
const ASR_DIGIT_READINGS: Record<string, string> = {
  "0": "ゼロ",
  "1": "イチ",
  "2": "ニ",
  "3": "サン",
  "4": "ヨン",
  "5": "ゴ",
  "6": "ロク",
  "7": "ナナ",
  "8": "ハチ",
  "9": "キュー",
};

// Native-Japanese counter words the engine writes back as digits
// (ふたつ -> "2つ"). Expanded before the single-digit rule, which would
// otherwise produce につ.
const ASR_COUNTER_READINGS: Record<string, string> = {
  "1": "ヒト",
  "2": "フタ",
  "3": "ミッ",
  "4": "ヨッ",
  "5": "イツ",
  "6": "ムッ",
  "7": "ナナ",
  "8": "ヤッ",
  "9": "ココノ",
};

// Applied to the transcript side only, after dictionary replacement, so
// dictionary keys containing digits (WPA3, IPv6...) are never affected.
function expandAsrArtifacts(reading: string): string {
  const withCounters = reading.replace(
    /(?<![0-9])([0-9])(?=[つツ])/g,
    (_, digit) => ASR_COUNTER_READINGS[digit],
  );
  const withDigits = withCounters.replace(
    /(?<![0-9])[0-9](?![0-9])/g,
    (digit) => ASR_DIGIT_READINGS[digit],
  );
  // Remaining Latin tokens in a transcript are almost always the STT
  // engine re-spelling letter sounds ("at" for えーてぃー), so read them
  // letter by letter. A genuine reading difference still surfaces because
  // the expected reading would not contain those letter sounds.
  return withDigits.replace(LATIN_TOKEN_PATTERN, (token) =>
    spellOutAcronym(token.toUpperCase()),
  );
}

export async function convertTextToComparisonReading(
  text: string,
  extraCorrections?: Record<string, string>,
): Promise<string> {
  const corrections = buildCorrections(extraCorrections);
  const reading = await buildDictionaryReading(text, corrections);
  const expanded = expandAsrArtifacts(reading);
  return normalizeComparisonKana(katakanaToHiragana(expanded));
}

/**
 * Comparison reading for TTS synthesis scripts. Uses the same dictionary +
 * kuromoji + acronym pipeline as the expected reading so identical source
 * text on both sides can never produce a spurious mismatch. No ASR
 * artifact expansion: synthesis text is authored, not transcribed.
 */
export async function convertSynthesisTextToComparisonReading(
  text: string,
  extraCorrections?: Record<string, string>,
): Promise<string> {
  const corrections = buildCorrections(extraCorrections);
  const reading = await buildDictionaryReading(text, corrections);
  return normalizeComparisonKana(katakanaToHiragana(reading));
}
