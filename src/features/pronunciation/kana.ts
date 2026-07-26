/**
 * Kana normalization utilities for pronunciation comparison.
 */

// Katakana to Hiragana conversion offset
const KATAKANA_TO_HIRAGANA_OFFSET = 0x30a0 - 0x3040;

/**
 * Convert katakana characters to hiragana.
 */
export function katakanaToHiragana(text: string): string {
  return text.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - KATAKANA_TO_HIRAGANA_OFFSET),
  );
}

/**
 * Remove punctuation, whitespace, and brackets for comparison.
 * Keeps only kana, kanji, and prolonged sound mark (ー) characters.
 */
export function removePunctuationForComparison(text: string): string {
  return text
    .replace(/[\s\u3000]/g, "") // whitespace
    .replace(/[、。，．・：；？！゛゜´｀¨＾￣＿ヽヾゝゞ〃仝々〆〇―‐／＼〜～‖｜…‥''""（）〔〕［］｛｝〈〉《》「」『』【】＋−±×÷＝≠＜＞≦≧∞∴♂♀°′″℃￥＄￠￡％＃＆＊＠§☆★○●◎◇◆]/g, "")
    .replace(/[.,;:?!'"()\[\]{}<>\/\\|@#$%^&*+=~`_-]/g, "");
}

/**
 * Apply NFKC normalization to the input.
 */
export function normalizeUnicode(text: string): string {
  return text.normalize("NFKC");
}

/**
 * Normalize text for comparison:
 * 1. NFKC normalization
 * 2. Katakana to hiragana
 * 3. Remove punctuation and whitespace
 */
export function normalizeComparisonKana(value: string): string {
  const normalized = normalizeUnicode(value);
  const hiragana = katakanaToHiragana(normalized);
  return removePunctuationForComparison(hiragana);
}
