import { z } from "zod";
import type { ContentInput } from "./types";

const HttpsUrlSchema = z
  .string()
  .url()
  .refine((url) => url.startsWith("https://"), {
    message: "assetBaseUrl must use HTTPS",
  });

const AudioPathSchema = z
  .string()
  .min(1)
  .refine((path) => !path.includes(".."), {
    message: "audioPath must not contain '..'",
  })
  .refine((path) => !path.includes("\\"), {
    message: "audioPath must not contain backslashes",
  })
  .refine((path) => !path.includes("://"), {
    message: "audioPath must not contain a scheme",
  });

const DocumentItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  tts: z.object({
    text: z.string().optional(),
    audioPath: AudioPathSchema,
  }),
});

const QuizQuestionSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    choices: z.array(z.string().min(1)).min(1),
    answerIndex: z.number().int().min(0),
    explanation: z.string().min(1),
    tts: z.object({
      questionText: z.string().optional(),
      choiceTexts: z.array(z.string()).optional(),
      explanationText: z.string().optional(),
      questionAudioPath: AudioPathSchema,
      choiceAudioPaths: z.array(AudioPathSchema).min(1),
      explanationAudioPath: AudioPathSchema,
    }),
  })
  .refine((q) => q.answerIndex < q.choices.length, {
    message: "answerIndex must be a valid index of choices",
    path: ["answerIndex"],
  })
  .refine(
    (q) =>
      q.tts.choiceTexts === undefined ||
      q.tts.choiceTexts.length === q.choices.length,
    {
      message: "choiceTexts must have the same length as choices",
      path: ["tts", "choiceTexts"],
    },
  )
  .refine((q) => q.tts.choiceAudioPaths.length === q.choices.length, {
    message: "choiceAudioPaths must have the same length as choices",
    path: ["tts", "choiceAudioPaths"],
  });

const BaseContentSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(1, {
    errorMap: () => ({ message: "schemaVersion must be 1" }),
  }),
  title: z.string().min(1),
  language: z.literal("ja"),
  assetBaseUrl: HttpsUrlSchema,
});

export const DocumentContentSchema = BaseContentSchema.extend({
  type: z.literal("document"),
  documents: z.array(DocumentItemSchema).min(1),
});

export const QuizContentSchema = BaseContentSchema.extend({
  type: z.literal("quiz"),
  questions: z.array(QuizQuestionSchema).min(1),
});

export const ContentSchema = z.discriminatedUnion("type", [
  DocumentContentSchema,
  QuizContentSchema,
]);

export function parseContent(input: unknown): ContentInput {
  return ContentSchema.parse(input);
}
