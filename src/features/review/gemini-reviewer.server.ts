import { GoogleGenAI } from "@google/genai";
import { GeminiReviewSchema, type GeminiReview } from "./review-contract";
import type { ReadingEdit } from "@/features/pronunciation/align-readings";

export type AudioReviewInput = {
  audio: Buffer;
  mimeType: "audio/mpeg";
  displayText: string;
  expectedReading: string;
  synthesisText: string | null;
  sttTranscript: string;
  candidateEdits: ReadingEdit[];
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

const SYSTEM_INSTRUCTION = `Judge only whether the audio pronunciation matches expectedReading.
Do not change expectedReading.
The STT transcript often silently corrects misread words back to their standard spelling, so never trust it as proof of correct pronunciation: listen to the audio itself and verify the reading of each content word against expectedReading.
Report EVERY mismatched location in findings, not just the first one.
Return mismatch only when you can provide heardReading and an audio time range for each finding.
Return inconclusive when the evidence is insufficient.`;

const ASSUMED_READING_SYSTEM_INSTRUCTION = `Some tokens have no dictionary reading.
Assume the conventional Japanese reading used in the Japanese IT industry for those tokens, then judge whether the audio pronunciation matches that assumed reading.
The STT transcript often silently corrects misread words back to their standard spelling, so never trust it as proof of correct pronunciation: listen to the audio itself.
Report EVERY mismatched location in findings, not just the first one.
Return mismatch only when you can provide heardReading and an audio time range for each finding.
Return inconclusive when the evidence is insufficient.`;

// Shared JSON response format description embedded in both prompts.
const RESPONSE_FORMAT = `以下のJSON形式で回答してください:
{
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

  const editsDescription = input.candidateEdits
    .filter((e) => e.operation !== "equal")
    .map(
      (e) =>
        `${e.operation}: expected "${e.expected}" vs observed "${e.observed}"`,
    )
    .join("\n");

  const assumedMode =
    input.unknownTokens !== null && input.unknownTokens.length > 0;

  const prompt = assumedMode
    ? `表示本文: ${input.displayText}
期待読み: (未確定)
辞書未登録の語: ${input.unknownTokens!.join(", ")}
音声生成用テキスト: ${input.synthesisText || "(なし)"}
STT転写結果: ${input.sttTranscript}

期待読みは確定していません。辞書未登録の語については、日本のIT分野で慣用的な日本語読みを想定してください。
音声を聴いて、読み上げがその慣用読みとして適切か判定してください。
不一致が複数箇所ある場合は、findingsにすべて列挙してください。
${RESPONSE_FORMAT}`
    : `表示本文: ${input.displayText}
期待読み: ${input.expectedReading}
音声生成用テキスト: ${input.synthesisText || "(なし)"}
STT転写結果: ${input.sttTranscript}
候補差分:
${editsDescription || "(差分なし)"}

音声を聴いて、期待読みと実際の発音が一致するか判定してください。
注意: STT転写は誤読を正しい表記に自動補正することがあります。転写や候補差分に頼らず、音声そのものを聴いて、漢字語の読みを一つずつ期待読みと照合してください。
不一致が複数箇所ある場合は、findingsにすべて列挙してください。
${RESPONSE_FORMAT}`;

  const responseSchema = {
    type: "OBJECT",
    properties: {
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
