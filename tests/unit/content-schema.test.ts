import { describe, expect, it } from "vitest";
import { parseContent } from "@/features/content/content-schema";

describe("parseContent", () => {
  const validDocument = {
    id: "x",
    type: "document",
    schemaVersion: 1,
    title: "Test Document",
    language: "ja",
    assetBaseUrl: "https://cdn.convly.jp/root",
    documents: [
      {
        id: "doc-1",
        text: "Test text",
        tts: { audioPath: "audio/test.mp3" },
      },
    ],
  };

  const validQuiz = {
    id: "x",
    type: "quiz",
    schemaVersion: 1,
    title: "Test Quiz",
    language: "ja",
    assetBaseUrl: "https://cdn.convly.jp/root",
    questions: [
      {
        id: "q-1",
        question: "Question?",
        choices: ["A", "B", "C", "D"],
        answerIndex: 0,
        explanation: "Explanation",
        tts: {
          questionAudioPath: "audio/q.mp3",
          choiceAudioPaths: [
            "audio/c0.mp3",
            "audio/c1.mp3",
            "audio/c2.mp3",
            "audio/c3.mp3",
          ],
          explanationAudioPath: "audio/e.mp3",
        },
      },
    ],
  };

  it("parses a valid document", () => {
    const result = parseContent(validDocument);
    expect(result.type).toBe("document");
  });

  it("parses a valid quiz", () => {
    const result = parseContent(validQuiz);
    expect(result.type).toBe("quiz");
  });

  it("rejects unsupported type", () => {
    expect(() =>
      parseContent({ ...validDocument, type: "video" }),
    ).toThrow();
  });

  it("rejects schemaVersion !== 1", () => {
    expect(() =>
      parseContent({
        ...validDocument,
        schemaVersion: 2,
      }),
    ).toThrow(/schemaVersion/);
  });

  it("rejects non-HTTPS assetBaseUrl", () => {
    expect(() =>
      parseContent({
        ...validDocument,
        assetBaseUrl: "http://cdn.convly.jp/root",
      }),
    ).toThrow(/HTTPS/);
  });

  it("rejects missing audioPath", () => {
    expect(() =>
      parseContent({
        ...validDocument,
        documents: [{ id: "doc-1", text: "Test", tts: {} }],
      }),
    ).toThrow();
  });

  it("rejects invalid answerIndex", () => {
    expect(() =>
      parseContent({
        ...validQuiz,
        questions: [
          {
            ...validQuiz.questions[0],
            answerIndex: 10,
          },
        ],
      }),
    ).toThrow(/answerIndex/);
  });

  it("rejects mismatched choiceAudioPaths length", () => {
    expect(() =>
      parseContent({
        ...validQuiz,
        questions: [
          {
            ...validQuiz.questions[0],
            tts: {
              ...validQuiz.questions[0].tts,
              choiceAudioPaths: ["audio/c0.mp3"],
            },
          },
        ],
      }),
    ).toThrow(/choiceAudioPaths/);
  });

  it("rejects mismatched choiceTexts length", () => {
    expect(() =>
      parseContent({
        ...validQuiz,
        questions: [
          {
            ...validQuiz.questions[0],
            tts: {
              ...validQuiz.questions[0].tts,
              choiceTexts: ["A", "B"],
            },
          },
        ],
      }),
    ).toThrow(/choiceTexts/);
  });

  it("rejects audioPath with ..", () => {
    expect(() =>
      parseContent({
        ...validDocument,
        documents: [
          {
            id: "doc-1",
            text: "Test",
            tts: { audioPath: "../audio/test.mp3" },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects audioPath with backslash", () => {
    expect(() =>
      parseContent({
        ...validDocument,
        documents: [
          {
            id: "doc-1",
            text: "Test",
            tts: { audioPath: "audio\\test.mp3" },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects audioPath with scheme", () => {
    expect(() =>
      parseContent({
        ...validDocument,
        documents: [
          {
            id: "doc-1",
            text: "Test",
            tts: { audioPath: "https://evil.com/test.mp3" },
          },
        ],
      }),
    ).toThrow();
  });
});
