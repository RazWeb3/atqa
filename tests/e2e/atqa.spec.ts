import { test, expect, type Page } from "@playwright/test";
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

// Import a fixture file and wait for the workspace to appear. The dev
// server can serve HTML before React hydration finishes, in which case the
// file input's change handler is not attached yet and the event is lost;
// retry the import until the workspace renders.
async function importFixtureFile(
  page: Page,
  name: string,
  fixture: unknown,
  readyText: RegExp,
) {
  const fileInput = page.locator('input[type="file"]');
  await expect(async () => {
    await fileInput.setInputFiles({
      name,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await expect(page.getByText(readyText).first()).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 30000 });
}

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

    // Intercept audio API with a 1-second silent WAV so playback lasts
    await page.route("**/api/audio**", async (route) => {
      const sampleRate = 44100;
      const dataSize = sampleRate * 2; // 1 second, 16-bit mono silence
      const header = Buffer.alloc(44);
      header.write("RIFF", 0);
      header.writeUInt32LE(36 + dataSize, 4);
      header.write("WAVE", 8);
      header.write("fmt ", 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20); // PCM
      header.writeUInt16LE(1, 22); // mono
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(sampleRate * 2, 28); // byte rate
      header.writeUInt16LE(2, 32); // block align
      header.writeUInt16LE(16, 34); // bits per sample
      header.write("data", 36);
      header.writeUInt32LE(dataSize, 40);
      const silentWav = Buffer.concat([header, Buffer.alloc(dataSize)]);

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

    // Step 1: Import document JSON and wait for 42 units
    await importFixtureFile(page, "document.json", documentFixture, /42ユニット/);

    // Step 3: Select doc-1 (should be selected by default)
    await expect(page.getByText("ITパスポートの学習では")).toBeVisible();

    // Step 4: Start and pause playback
    const playButton = page.getByRole("button", { name: "再生", exact: true });
    await playButton.click();
    await page.waitForTimeout(500);
    const pauseButton = page.getByRole("button", { name: "一時停止" });
    await pauseButton.click();

    // Step 5: Run review
    const reviewButton = page.getByRole("button", { name: "この音声をAI検査" });
    await reviewButton.click();

    // Step 6: Primary issue summary is visible without scrolling context
    await expect(page.getByTestId("review-status")).toHaveText("要確認", {
      timeout: 10000,
    });
    await expect(page.getByTestId("primary-issue")).toContainText(
      "発音の疑い",
    );

    // Expand the collapsed evidence and see あいてぃー / いっと
    await page.getByText("詳細な根拠を見る").click();
    await expect(page.getByText("あいてぃー")).toBeVisible();
    await expect(page.getByText("いっと")).toBeVisible();

    // Step 7: Seek and play from the primary issue
    const seekButton = page
      .getByRole("button", { name: /問題位置から再生/ })
      .first();
    await expect(seekButton).toBeVisible();
    await seekButton.click();

    // Step 8: Assert counters (検査済み 1 / 42)
    await expect(page.getByText("検査済み")).toBeVisible();
    await expect(page.locator(".status-summary")).toContainText("1");

    // Verify only one review request was made
    expect(reviewCallCount).toBe(1);
  });

  test("quiz import shows 30 questions and correct playback kinds", async ({
    page,
  }) => {
    await page.goto("/");

    // Import quiz JSON and assert 30 questions
    await importFixtureFile(page, "quiz.json", quizFixture, /30問/);

    // Assert 180 units (30 questions * 6 units each)
    await expect(page.getByText(/180ユニット/)).toBeVisible();

    // Check first question group shows correct kinds
    // First unit should be "question" kind
    await expect(page.locator("p.unit-text")).toContainText(
      "ITプロジェクトの特性として",
    );
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

    // Import document and wait for 42 units
    await importFixtureFile(page, "document.json", documentFixture, /42ユニット/);

    // Run review
    await page.getByRole("button", { name: "この音声をAI検査" }).click();

    // Should show inconclusive, not pass
    await expect(page.getByTestId("review-status")).toHaveText("判定不能", {
      timeout: 10000,
    });
    await expect(page.getByText("正常")).not.toBeVisible();
  });

  test("human judgment is separate from AI verdict", async ({ page }) => {
    // Intercept reviews API
    await page.route("**/api/reviews", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(reviewMispronunciationResponse),
      });
    });

    await page.goto("/");

    // Import document and wait for 42 units
    await importFixtureFile(page, "document.json", documentFixture, /42ユニット/);

    // Run review
    await page.getByRole("button", { name: "この音声をAI検査" }).click();
    await expect(page.getByTestId("review-status")).toHaveText("要確認", {
      timeout: 10000,
    });

    // Record the human judgment as a confirmed issue
    await page.getByRole("button", { name: "問題ありと確認" }).click();

    // AI verdict should still show 要確認
    await expect(page.getByTestId("review-status")).toContainText("要確認");

    // But the human judgment badge should appear
    await expect(page.getByText("✓ 問題ありと確認")).toBeVisible();
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

    // Import document and wait for 42 units
    await importFixtureFile(page, "document.json", documentFixture, /42ユニット/);

    // Click review button multiple times rapidly.
    // While pending, the button label changes to 検査中... and it is disabled,
    // so target the stable class locator for the forced duplicate clicks.
    const reviewButton = page.getByRole("button", { name: "この音声をAI検査" });
    await reviewButton.click();
    const pendingButton = page.locator(".btn-review");
    await pendingButton.click({ force: true }); // Button should be disabled
    await pendingButton.click({ force: true });

    // Wait for response
    await expect(page.getByTestId("review-status")).toHaveText("正常", {
      timeout: 10000,
    });

    // Only one request should have been made
    expect(requestCount).toBe(1);
  });

  test("batch review runs all units with progress and updates the summary", async ({
    page,
  }) => {
    let requestCount = 0;

    await page.route("**/api/reviews", async (route) => {
      requestCount++;
      const unitId = route.request().postDataJSON()?.unit?.id ?? "doc-1";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...reviewPassResponse, unitId }),
      });
    });

    await page.goto("/");

    // Import document and wait for 42 units
    await importFixtureFile(page, "document.json", documentFixture, /42ユニット/);

    // Start the batch review
    await page.getByTestId("batch-start").click();

    // All 42 units end up reviewed
    await expect(page.locator(".status-summary")).toContainText("42 / 42", {
      timeout: 30000,
    });
    expect(requestCount).toBe(42);

    // Batch controls return to idle and nothing is left to review
    await expect(page.getByTestId("batch-start")).toBeDisabled();
  });
});
