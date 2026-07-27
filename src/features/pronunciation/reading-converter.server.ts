import kuromoji from "kuromoji";
import path from "path";

// Cache the tokenizer builder promise
let tokenizerPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | null =
  null;

function getTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      const dictPath = path.join(
        process.cwd(),
        "node_modules",
        "kuromoji",
        "dict",
      );
      kuromoji.builder({ dicPath: dictPath }).build((err, tokenizer) => {
        if (err) {
          reject(err);
        } else {
          resolve(tokenizer);
        }
      });
    });
  }
  return tokenizerPromise;
}

// kuromoji (IPADIC) picks a wrong reading for some standalone tokens,
// which poisons the expected reading and flags correctly read audio.
// Verified examples: 「特殊な語も」 tokenizes 語 as カタリ instead of ゴ.
// Overrides are keyed by surface form and only replace the known-bad
// reading, so compound tokens (日本語など) are untouched.
const TOKEN_READING_OVERRIDES: Record<string, Record<string, string>> = {
  語: { カタリ: "ゴ" },
};

/**
 * Convert Japanese text to reading (hiragana) using kuromoji.
 * Returns the reading for the entire input text.
 */
export async function convertToReading(text: string): Promise<string> {
  const tokenizer = await getTokenizer();
  const tokens = tokenizer.tokenize(text);

  let reading = "";
  for (const token of tokens) {
    if (token.reading) {
      // token.reading is in katakana, convert to hiragana later
      reading +=
        TOKEN_READING_OVERRIDES[token.surface_form]?.[token.reading] ??
        token.reading;
    } else if (token.surface_form) {
      // Fallback to surface form if no reading
      reading += token.surface_form;
    }
  }

  return reading;
}
