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

// Vowel-lengthening kana sequences (えい, おう...) are pronounced as plain
// long vowels, so spelling variants like えい/えー or きゅう/きゅー must
// never count as a pronunciation difference.
const LONG_VOWEL_PATTERNS: Array<[RegExp, string]> = [
  [/([あかがさざただなはばぱまやらわゃ])あ/g, "$1ー"],
  [/([いきぎしじちぢにひびぴみりぃ])い/g, "$1ー"],
  [/([うくぐすずつづぬふぶぷむゆるゅ])う/g, "$1ー"],
  [/([えけげせぜてでねへべぺめれぇ])[いえ]/g, "$1ー"],
  [/([おこごそぞとどのほぼぽもよろょ])[うお]/g, "$1ー"],
];

/**
 * Collapse vowel-lengthening sequences into ー. Apply to BOTH sides of a
 * fuzzy comparison; never to values shown to the user.
 */
export function normalizeLongVowels(hiragana: string): string {
  let result = hiragana;
  for (const [pattern, replacement] of LONG_VOWEL_PATTERNS) {
    let previous;
    do {
      previous = result;
      result = result.replace(pattern, replacement);
    } while (result !== previous);
  }
  return result;
}

/**
 * Normalize kana to the level of actual sound: collapse long-vowel
 * spelling variants and unify particle spellings (は/わ, へ/え, を/お)
 * that are written differently but pronounced the same. Apply to BOTH
 * sides of a comparison; never to values shown to the user.
 */
export function normalizeSoundKana(hiragana: string): string {
  const particles = hiragana
    .replace(/は/g, "わ")
    .replace(/へ/g, "え")
    .replace(/を/g, "お");
  return normalizeLongVowels(particles);
}
