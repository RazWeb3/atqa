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
Return mismatch only when you can provide heardReading and an audio time range.
Return inconclusive when the evidence is insufficient.`;

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

  const prompt = `表示本文: ${input.displayText}
期待読み: ${input.expectedReading}
音声生成用テキスト: ${input.synthesisText || "(なし)"}
STT転写結果: ${input.sttTranscript}
候補差分:
${editsDescription || "(差分なし)"}

音声を聞いて、期待読みと実際の発音が一致するか判定してください。
以下のJSON形式で回答してください:
{
  "verdict": "match" | "mismatch" | "inconclusive",
  "heardReading": string | null,
  "reason": string (300文字以内),
  "startSec": number | null,
  "endSec": number | null
}`;

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
    },
    required: ["verdict", "heardReading", "reason", "startSec", "endSec"],
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
          systemInstruction: SYSTEM_INSTRUCTION,
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
