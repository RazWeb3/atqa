export type PlaybackUnitKind =
  | "document"
  | "question"
  | "choice"
  | "explanation";

export type PlaybackUnit = {
  id: string;
  groupId: string;
  kind: PlaybackUnitKind;
  order: number;
  displayText: string;
  synthesisText: string | null;
  expectedReading: string | null;
  audioUrl: string;
  sourcePath: string;
};

export type NormalizedContent = {
  content: {
    id: string;
    type: "document" | "quiz";
    title: string;
    groupCount: number;
    unitCount: number;
  };
  units: PlaybackUnit[];
  warnings: ValidationMessage[];
};

export type ValidationMessage = {
  path: string;
  message: string;
};

export type DocumentItem = {
  id: string;
  text: string;
  tts: {
    text?: string;
    audioPath: string;
  };
};

export type QuizQuestion = {
  id: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  tts: {
    questionText?: string;
    choiceTexts?: string[];
    explanationText?: string;
    questionAudioPath: string;
    choiceAudioPaths: string[];
    explanationAudioPath: string;
  };
};

export type DocumentContent = {
  id: string;
  type: "document";
  schemaVersion: 1;
  title: string;
  language: "ja";
  assetBaseUrl: string;
  documents: DocumentItem[];
};

export type QuizContent = {
  id: string;
  type: "quiz";
  schemaVersion: 1;
  title: string;
  language: "ja";
  assetBaseUrl: string;
  questions: QuizQuestion[];
};

export type ContentInput = DocumentContent | QuizContent;
