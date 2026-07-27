import { z } from "zod";

export type IssueCode =
  | "SYNTHESIS_TEXT_MISMATCH"
  | "AUDIO_PRONUNCIATION_SUSPECT"
  | "OMISSION_SUSPECT"
  | "DUPLICATION_SUSPECT"
  | "UNDEFINED_READING"
  | "AUDIO_UNCLEAR_SUSPECT"
  | "LOW_ASR_CONFIDENCE"
  | "ASR_GEMINI_CONFLICT"
  | "AUDIO_FETCH_FAILED"
  | "MODEL_OUTPUT_INVALID";

export type ReviewStatus = "pass" | "review" | "inconclusive";

export type ReviewIssue = {
  code: IssueCode;
  status: "review" | "inconclusive";
  sourceStage: "synthesis_text" | "audio";
  expected: string | null;
  observed: string | null;
  startSec: number | null;
  endSec: number | null;
  reason: string;
  // Tokens without a deterministic reading, offered for one-click
  // whitelist registration. Absent on issues not tied to specific tokens.
  tokens?: string[] | null;
};

export type StageReview = {
  status: "pass" | "review" | "inconclusive" | "not_recorded";
  issues: ReviewIssue[];
};

export type ReviewResponse = {
  unitId: string;
  status: ReviewStatus;
  synthesisReview: ReviewIssue[];
  audioReview: ReviewIssue[];
  asrTranscript: string | null;
  asrConfidence: number | null;
};

// Zod schema for review request
export const ReviewRequestSchema = z.object({
  unit: z.object({
    id: z.string(),
    groupId: z.string(),
    kind: z.enum(["document", "question", "choice", "explanation"]),
    order: z.number(),
    displayText: z.string(),
    synthesisText: z.string().nullable(),
    expectedReading: z.string().nullable(),
    audioUrl: z.string().url(),
    sourcePath: z.string(),
  }),
});

// Zod schema for Gemini review output
export const GeminiReviewSchema = z.object({
  verdict: z.enum(["match", "mismatch", "inconclusive"]),
  heardReading: z.string().nullable(),
  reason: z.string().max(300),
  startSec: z.number().min(0).nullable(),
  endSec: z.number().min(0).nullable(),
});

export type GeminiReview = z.infer<typeof GeminiReviewSchema>;

// Zod schema for review response
export const ReviewResponseSchema = z.object({
  unitId: z.string(),
  status: z.enum(["pass", "review", "inconclusive"]),
  synthesisReview: z.array(
    z.object({
      code: z.string(),
      status: z.enum(["review", "inconclusive"]),
      sourceStage: z.enum(["synthesis_text", "audio"]),
      expected: z.string().nullable(),
      observed: z.string().nullable(),
      startSec: z.number().nullable(),
      endSec: z.number().nullable(),
      reason: z.string(),
      tokens: z.array(z.string()).nullable().optional(),
    }),
  ),
  audioReview: z.array(
    z.object({
      code: z.string(),
      status: z.enum(["review", "inconclusive"]),
      sourceStage: z.enum(["synthesis_text", "audio"]),
      expected: z.string().nullable(),
      observed: z.string().nullable(),
      startSec: z.number().nullable(),
      endSec: z.number().nullable(),
      reason: z.string(),
      tokens: z.array(z.string()).nullable().optional(),
    }),
  ),
  asrTranscript: z.string().nullable(),
  asrConfidence: z.number().nullable(),
});
