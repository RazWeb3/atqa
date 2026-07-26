import type {
  ContentInput,
  DocumentContent,
  NormalizedContent,
  PlaybackUnit,
  QuizContent,
  ValidationMessage,
} from "./types";

function buildAudioUrl(audioPath: string, baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(audioPath, normalizedBase);
  if (url.protocol !== "https:") {
    throw new Error(`Audio URL must use HTTPS: ${url.href}`);
  }
  return url.href;
}

function normalizeDocument(content: DocumentContent): PlaybackUnit[] {
  const units: PlaybackUnit[] = [];

  content.documents.forEach((doc, index) => {
    units.push({
      id: doc.id,
      groupId: doc.id,
      kind: "document",
      order: index,
      displayText: doc.text,
      synthesisText: doc.tts.text ?? null,
      expectedReading: null,
      audioUrl: buildAudioUrl(doc.tts.audioPath, content.assetBaseUrl),
      sourcePath: `documents[${index}]`,
    });
  });

  return units;
}

function normalizeQuiz(content: QuizContent): PlaybackUnit[] {
  const units: PlaybackUnit[] = [];
  let order = 0;

  content.questions.forEach((q, qIndex) => {
    // Question unit
    units.push({
      id: `${q.id}:question`,
      groupId: q.id,
      kind: "question",
      order: order++,
      displayText: q.question,
      synthesisText: q.tts.questionText ?? null,
      expectedReading: null,
      audioUrl: buildAudioUrl(q.tts.questionAudioPath, content.assetBaseUrl),
      sourcePath: `questions[${qIndex}]`,
    });

    // Choice units
    q.choices.forEach((choice, cIndex) => {
      units.push({
        id: `${q.id}:choice:${cIndex}`,
        groupId: q.id,
        kind: "choice",
        order: order++,
        displayText: choice,
        synthesisText: q.tts.choiceTexts?.[cIndex] ?? null,
        expectedReading: null,
        audioUrl: buildAudioUrl(
          q.tts.choiceAudioPaths[cIndex],
          content.assetBaseUrl,
        ),
        sourcePath: `questions[${qIndex}].choices[${cIndex}]`,
      });
    });

    // Explanation unit
    units.push({
      id: `${q.id}:explanation`,
      groupId: q.id,
      kind: "explanation",
      order: order++,
      displayText: q.explanation,
      synthesisText: q.tts.explanationText ?? null,
      expectedReading: null,
      audioUrl: buildAudioUrl(
        q.tts.explanationAudioPath,
        content.assetBaseUrl,
      ),
      sourcePath: `questions[${qIndex}].explanation`,
    });
  });

  return units;
}

export function normalizeContent(input: ContentInput): NormalizedContent {
  const warnings: ValidationMessage[] = [];

  const units =
    input.type === "document"
      ? normalizeDocument(input)
      : normalizeQuiz(input);

  const groupCount =
    input.type === "document"
      ? input.documents.length
      : input.questions.length;

  return {
    content: {
      id: input.id,
      type: input.type,
      title: input.title,
      groupCount,
      unitCount: units.length,
    },
    units,
    warnings,
  };
}
