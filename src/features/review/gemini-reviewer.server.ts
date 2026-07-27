import { GoogleGenAI } from "@google/genai";
import { GeminiReviewSchema, type GeminiReview } from "./review-contract";

export type AudioReviewInput = {
  audio: Buffer;
  mimeType: "audio/mpeg";
  displayText: string;
  expectedReading: string;
  // Tokens without a dictionary/deterministic reading. When present, the
  // model assumes the conventional Japanese reading instead of matching
  // against expectedReading (assumed-reading mode).
  unknownTokens: string[] | null;
};

export class ModelOutputInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputInvalidError";
  }
}

// Cache the GenAI client
let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
  if (!genAI) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

    if (!project) {
      throw new Error("GOOGLE_CLOUD_PROJECT environment variable is required");
    }

    genAI = new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
  }
  return genAI;
}

// Transcribe-first review: the model writes down what it actually hears
// before judging, instead of rubber-stamping STT output or candidate
// diffs (which silently normalize misreads and bias the verdict).
const SYSTEM_INSTRUCTION = `You are auditing Japanese TTS audio for misread words.
Work in two steps.
Step 1: Transcribe the audio into kana exactly as pronounced (kanaTranscript). Never normalize a misread word back to its correct reading; when a kanji word is pronounced with the wrong reading (e.g. 一段落 read as ひとだんらく instead of いちだんらく), write the sounds you actually hear.
Step 2: Compare your kana transcript against expectedReading content word by content word, and report EVERY location whose pronunciation differs (findings).
Do not change expectedReading.
Treat long-vowel spelling variants (きゅう/きゅー, えい/えー), particle spellings (は/わ), small-kana variants and punctuation pauses as identical; report only real phoneme differences.
Return mismatch only when you can provide heardReading and an audio time range for each finding.
Return inconclusive when the evidence is insufficient.`;

const ASSUMED_READING_SYSTEM_INSTRUCTION = `Some tokens have no dictionary reading.
Assume the conventional Japanese reading used in the Japanese IT industry for those tokens.
Work in two steps.
Step 1: Transcribe the audio into kana exactly as pronounced (kanaTranscript). Never normalize a misread word back to its correct reading; write the sounds you actually hear.
Step 2: Judge whether the audio pronunciation of each token matches its conventional reading, and report EVERY mismatched location (findings).
Treat long-vowel spelling variants and punctuation pauses as identical; report only real phoneme differences.
Return mismatch only when you can provide heardReading and an audio time range for each finding.
Return inconclusive when the evidence is insufficient.`;

// Shared JSON response format description embedded in both prompts.
const RESPONSE_FORMAT = `以下のJSON形式で回答してください:
{
  "kanaTranscript": string (音声を聞こえたとおりに転写したかな。誤読も補正せずそのまま書く),
  "verdict": "match" | "mismatch" | "inconclusive",
  "heardReading": string | null (最も顕著な不一致箇所の実際の読み),
  "reason": string (300文字以内),
  "startSec": number | null,
  "endSec": number | null,
  "findings": [
    {
      "heardReading": string (この箇所で実際に聞こえた読み),
      "reason": string (300文字以内),
      "startSec": number | null,
      "endSec": number | null
    }
  ] (不一致箇所すべてを列挙。mismatch時は1件以上、match時は空配列)
}`;

/**
 * Review audio pronunciation using Gemini.
 */
export async function reviewAudioWithGemini(
  input: AudioReviewInput,
): Promise<GeminiReview> {
  const ai = getGenAI();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const assumedMode =
    input.unknownTokens !== null && input.unknownTokens.length > 0;

  const prompt = assumedMode
    ? `表示本文: ${input.displayText}
期待読み: (未確定)
辞書未登録の語: ${input.unknownTokens!.join(", ")}

まず音声を聞こえたとおりにかなで転写してください（kanaTranscript）。誤読も補正せず、実際の音をそのまま書きます。
次に、辞書未登録の語については日本のIT分野で慣用的な日本語読みを想定し、読み上げがその慣用読みとして適切か判定してください。
不一致が複数箇所ある場合は、findingsにすべて列挙してください。
${RESPONSE_FORMAT}`
    : `表示本文: ${input.displayText}
期待読み: ${input.expectedReading}

まず音声を聞こえたとおりにかなで転写してください（kanaTranscript）。誤読も補正せず、実際の音をそのまま書きます。
次に、その転写と期待読みを内容語ごとに照合し、読みが異なる箇所をすべてfindingsに列挙してください。
長音表記の揺れ（きゅう/きゅーなど）や句読点は不一致としないでください。
${RESPONSE_FORMAT}`;

  const responseSchema = {
    type: "OBJECT",
    properties: {
      kanaTranscript: {
        type: "STRING",
      },
      verdict: {
        type: "STRING",
        enum: ["match", "mismatch", "inconclusive"],
      },
      heardReading: {
        type: "STRING",
        nullable: true,
      },
      reason: {
        type: "STRING",
      },
      startSec: {
        type: "NUMBER",
        nullable: true,
      },
      endSec: {
        type: "NUMBER",
        nullable: true,
      },
      findings: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            heardReading: { type: "STRING" },
            reason: { type: "STRING" },
            startSec: { type: "NUMBER", nullable: true },
            endSec: { type: "NUMBER", nullable: true },
          },
          required: ["heardReading", "reason", "startSec", "endSec"],
        },
      },
    },
    required: [
      "kanaTranscript",
      "verdict",
      "heardReading",
      "reason",
      "startSec",
      "endSec",
      "findings",
    ],
  };

  // Try up to 2 times
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: input.mimeType,
                  data: input.audio.toString("base64"),
                },
              },
              { text: prompt },
            ],
          },
        ],
        config: {
          systemInstruction: assumedMode
            ? ASSUMED_READING_SYSTEM_INSTRUCTION
            : SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema,
          // The verdict/findings call is pinned to greedy decoding so the
          // same audio yields the same structured judgement across runs.
          // Its blind spot (it sometimes normalizes a real misread back to
          // "match") is covered by transcribeAudioKana, which runs with
          // default sampling to hear misreads faithfully.
          temperature: 0,
          seed: 42,
        },
      });

      const text = response.text;
      if (!text) {
        throw new ModelOutputInvalidError("Empty response from model");
      }

      // Parse and validate the response
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ModelOutputInvalidError("Invalid JSON in model response");
      }

      const parsed = GeminiReviewSchema.safeParse(json);
      if (!parsed.success) {
        throw new ModelOutputInvalidError(
          `Model output validation failed: ${parsed.error.message}`,
        );
      }

      return parsed.data;
    } catch (error) {
      if (attempt === 1) {
        if (error instanceof ModelOutputInvalidError) {
          throw error;
        }
        throw new ModelOutputInvalidError(
          `Model request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
      // Retry on first failure
    }
  }

  throw new ModelOutputInvalidError("Failed to get valid response from model");
}

/**
 * Transcribe the audio into kana without showing the model any expected
 * reading. When the review prompt contains the expected reading, the model
 * anchors on it and normalizes real misreads back to a "match"; this blind
 * call reports the sounds actually present, so the caller can diff them
 * against the expected reading deterministically.
 */
export async function transcribeAudioKana(input: {
  audio: Buffer;
  mimeType: "audio/mpeg";
}): Promise<string> {
  const ai = getGenAI();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: input.mimeType,
              data: input.audio.toString("base64"),
            },
          },
          {
            text: "この音声を、聞こえたとおりにすべてひらがなで転写してください。漢字や英字は使わず、実際に発音された音をそのまま書いてください。転写のみを出力してください。",
          },
        ],
      },
    ],
    // Deliberately free-form and default sampling: both a JSON response
    // schema and greedy decoding pull the transcript toward the
    // statistically expected (i.e. correct) reading, normalizing exactly
    // the misreads this call exists to hear. Runaway responses (meta
    // commentary) are rejected by the caller's length sanity gate.
  });

  const text = response.text;
  if (!text || !text.trim()) {
    throw new ModelOutputInvalidError("Empty transcription from model");
  }
  return text.trim();
}
