import { test, expect } from "@playwright/test";
import type { NormalizedContent, PlaybackUnit } from "@/features/content/types";
import type { ReviewResponse } from "@/features/review/review-contract";
import documentFixture from "../fixtures/document.json";
import quizFixture from "../fixtures/quiz.json";

// Helper to create a mock normalized response
function createNormalizedDocument(): NormalizedContent {
  const units: PlaybackUnit[] = [];
  const docs = documentFixture.documents;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    units.push({
      id: doc.id,
      groupId: doc.id,
      kind: "document",
      order: i,
      displayText: doc.text,
      synthesisText: doc.tts.text || null,
      expectedReading: null,
      audioUrl: `${documentFixture.assetBaseUrl}/${doc.tts.audioPath}`,
      sourcePath: `documents[${i}]`,
    });
  }

  return {
    content: {
      id: documentFixture.id,
      type: "document",
      title: documentFixture.title,
      groupCount: docs.length,
      unitCount: units.length,
    },
    units,
    warnings: [],
  };
}

function createNormalizedQuiz(): NormalizedContent {
  const units: PlaybackUnit[] = [];
  const questions = quizFixture.questions;

  for (let q = 0; q < questions.length; q++) {
    const question = questions[q];
    const groupId = question.id;

    // Question unit
    units.push({
      id: `${question.id}-question`,
      groupId,
      kind: "question",
      order: units.length,
      displayText: question.question,
      synthesisText: question.tts.questionText || null,
      expectedReading: null,
      audioUrl: `${quizFixture.assetBaseUrl}/${question.tts.questionAudioPath}`,
      sourcePath: `questions[${q}]`,
    });

    // Choice units
    for (let c = 0; c < question.choices.length; c++) {
      units.push({
        id: `${question.id}-choice-${c}`,
        groupId,
        kind: "choice",
        order: units.length,
        displayText: question.choices[c],
        synthesisText: question.tts.choiceTexts?.[c] || null,
        expectedReading: null,
        audioUrl: `${quizFixture.assetBaseUrl}/${question.tts.choiceAudioPaths[c]}`,
        sourcePath: `questions[${q}].choices[${c}]`,
      });
    }

    // Explanation unit
    units.push({
      id: `${question.id}-explanation`,
      groupId,
      kind: "explanation",
      order: units.length,
      displayText: question.explanation,
      synthesisText: question.tts.explanationText || null,
      expectedReading: null,
      audioUrl: `${quizFixture.assetBaseUrl}/${question.tts.explanationAudioPath}`,
      sourcePath: `questions[${q}].explanation`,
    });
  }

  return {
    content: {
      id: quizFixture.id,
      type: "quiz",
      title: quizFixture.title,
      groupCount: questions.length,
      unitCount: units.length,
    },
    units,
    warnings: [],
  };
}

// Mock review responses
const reviewPassResponse: ReviewResponse = {
  unitId: "doc-1",
  status: "pass",
  synthesisReview: [],
  audioReview: [],
  asrTranscript: "アイティープロジェクト",
  asrConfidence: 0.95,
};

const reviewMispronunciationResponse: ReviewResponse = {
  unitId: "doc-1",
  status: "review",
  synthesisReview: [],
  audioReview: [
    {
      code: "AUDIO_PRONUNCIATION_SUSPECT",
      status: "review",
      sourceStage: "audio",
      expected: "あいてぃー",
      observed: "いっと",
      startSec: 1.5,
      endSec: 2.3,
      reason: "発音の不一致が検出されました",
    },
  ],
  asrTranscript: "イットプロジェクト",
  asrConfidence: 0.92,
};

const reviewInconclusiveResponse: ReviewResponse = {
  unitId: "doc-1",
  status: "inconclusive",
  synthesisReview: [],
  audioReview: [
    {
      code: "LOW_ASR_CONFIDENCE",
      status: "inconclusive",
      sourceStage: "audio",
      expected: "あいてぃー",
      observed: null,
      startSec: null,
      endSec: null,
      reason: "音声認識の信頼度が低いです",
    },
  ],
  asrTranscript: null,
  asrConfidence: 0.45,
};

test.describe("ATQA E2E Journey", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept normalize API
    await page.route("**/api/content/normalize", async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();

      if (postData?.type === "document") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(createNormalizedDocument()),
        });
      } else if (postData?.type === "quiz") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(createNormalizedQuiz()),
        });
      } else {
        await route.continue();
      }
    });

    // Intercept audio API with silent WAV
    await page.route("**/api/audio**", async (route) => {
      // Generate a minimal silent WAV file (44 bytes header + minimal data)
      const silentWav = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x24, 0x00, 0x00, 0x00, // file size - 8
        0x57, 0x41, 0x56, 0x45, // WAVE
        0x66, 0x6d, 0x74, 0x20, // fmt
        0x10, 0x00, 0x00, 0x00, // chunk size
        0x01, 0x00,             // PCM
        0x01, 0x00,             // mono
        0x44, 0xac, 0x00, 0x00, // 44100 Hz
        0x88, 0x58, 0x01, 0x00, // byte rate
        0x02, 0x00,             // block align
        0x10, 0x00,             // bits per sample
        0x64, 0x61, 0x74, 0x61, // data
        0x00, 0x00, 0x00, 0x00, // data size
      ]);

      await route.fulfill({
        status: 200,
        contentType: "audio/wav",
        body: silentWav,
      });
    });
  });

  test("document import, review, and seek journey", async ({ page }) => {
    let reviewCallCount = 0;

    // Intercept reviews API - return mispronunciation on first call
    await page.route("**/api/reviews", async (route) => {
      reviewCallCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(reviewMispronunciationResponse),
      });
    });

    await page.goto("/");

    // Step 1: Import document JSON
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "document.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(documentFixture)),
    });

    // Step 2: Assert 42 units (document has 42 documents)
    await expect(page.getByText(/42ユニット/)).toBeVisible({ timeout: 10000 });

    // Step 3: Select doc-1 (should be selected by default)
    await expect(page.getByText("ITパスポートの学習では")).toBeVisible();

    // Step 4: Start and pause playback
    const playButton = page.getByRole("button", { name: "再生" });
    await playButton.click();
    await page.waitForTimeout(500);
    const pauseButton = page.getByRole("button", { name: "一時停止" });
    await pauseButton.click();

    // Step 5: Run review
    const reviewButton = page.getByRole("button", { name: "この音声をAI検査" });
    await reviewButton.click();

    // Step 6: See expected アイティー and heard イット
    await expect(page.getByText("要確認")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("あいてぃー")).toBeVisible();
    await expect(page.getByText("いっと")).toBeVisible();

    // Step 7: Seek from the issue
    const seekButton = page.getByRole("button", { name: /問題位置から再生/ });
    await expect(seekButton).toBeVisible();
    await seekButton.click();

    // Step 8: Assert counters
    await expect(page.getByText("検査済み")).toBeVisible();
    await expect(page.locator(".status-summary")).toContainText("1");

    // Verify only one review request was made
    expect(reviewCallCount).toBe(1);
  });

  test("quiz import shows 30 questions and correct playback kinds", async ({
    page,
  }) => {
    await page.goto("/");

    // Import quiz JSON
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "quiz.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(quizFixture)),
    });

    // Assert 30 questions
    await expect(page.getByText(/30問/)).toBeVisible({ timeout: 10000 });

    // Assert 180 units (30 questions * 6 units each)
    await expect(page.getByText(/180ユニット/)).toBeVisible();

    // Check first question group shows correct kinds
    // First unit should be "question" kind
    await expect(page.getByText("ITプロジェクトの特性として")).toBeVisible();
  });

  test("inconclusive review never shows pass style", async ({ page }) => {
    // Intercept reviews API with inconclusive
    await page.route("**/api/reviews", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(reviewInconclusiveResponse),
      });
    });

    await page.goto("/");

    // Import document
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "document.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(documentFixture)),
    });

    await expect(page.getByText(/42ユニット/)).toBeVisible({ timeout: 10000 });

    // Run review
    await page.getByRole("button", { name: "この音声をAI検査" }).click();

    // Should show inconclusive, not pass
    await expect(page.getByText("判定不能")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("正常")).not.toBeVisible();
  });

  test("human resolution is separate from AI verdict", async ({ page }) => {
    // Intercept reviews API
    await page.route("**/api/reviews", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(reviewMispronunciationResponse),
      });
    });

    await page.goto("/");

    // Import document
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "document.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(documentFixture)),
    });

    await expect(page.getByText(/42ユニット/)).toBeVisible({ timeout: 10000 });

    // Run review
    await page.getByRole("button", { name: "この音声をAI検査" }).click();
    await expect(page.getByText("要確認")).toBeVisible({ timeout: 10000 });

    // Mark as resolved
    await page.getByRole("button", { name: "確認済みにする" }).click();

    // AI verdict should still show 要確認
    await expect(page.getByTestId("review-status")).toContainText("要確認");

    // But human resolution badge should appear
    await expect(page.getByText("✓ 確認済み")).toBeVisible();
  });

  test("duplicate review clicks create only one request", async ({ page }) => {
    let requestCount = 0;

    await page.route("**/api/reviews", async (route) => {
      requestCount++;
      // Add delay to simulate slow response
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(reviewPassResponse),
      });
    });

    await page.goto("/");

    // Import document
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "document.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(documentFixture)),
    });

    await expect(page.getByText(/42ユニット/)).toBeVisible({ timeout: 10000 });

    // Click review button multiple times rapidly
    const reviewButton = page.getByRole("button", { name: "この音声をAI検査" });
    await reviewButton.click();
    await reviewButton.click({ force: true }); // Button should be disabled
    await reviewButton.click({ force: true });

    // Wait for response
    await expect(page.getByText("正常")).toBeVisible({ timeout: 10000 });

    // Only one request should have been made
    expect(requestCount).toBe(1);
  });
});
