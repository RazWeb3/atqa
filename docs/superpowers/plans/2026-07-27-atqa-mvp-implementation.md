# ATQA MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable Web prototype that imports Sokqa document/quiz JSON, continuously plays its segmented cloud audio, and reviews one selected audio unit for pronunciation problems using deterministic reading contracts, Cloud Speech-to-Text, and Vertex AI Gemini.

**Architecture:** A single Next.js App Router application runs on Cloud Run. Pure domain modules validate and normalize content, generate canonical readings, align text, and determine verdicts; browser modules own playback and session state; server-only adapters fetch approved CDN audio and call Google Cloud. External AI responses never override the dictionary-derived expected reading and any uncertain or failed analysis becomes `inconclusive`.

**Tech Stack:** Next.js, React, TypeScript, pnpm, Vitest, Testing Library, Playwright, Zod, kuromoji, Cloud Speech-to-Text V2, Vertex AI Gemini through `@google/genai`, Cloud Run.

## Global Constraints

- Implement only the 3-day MVP defined in `docs/superpowers/specs/2026-07-27-atqa-mvp-design.md`.
- Support `schemaVersion: 1`, `language: "ja"`, and content types `document` and `quiz`.
- Normalize the supplied document fixture to 42 playback units and the quiz fixture to 30 groups / 180 playback units.
- Inspect only one selected playback unit per request; do not add batch QA.
- Canonical expected reading comes from `displayText + corrections`; `synthesisText` is evidence, never the answer contract.
- Treat `IT → イット` as an audio-layer mispronunciation and `IT → アイティー` as the expected reading.
- A normal audio verdict requires both deterministic STT comparison and Gemini to support a match.
- Missing expectations, low-confidence STT, invalid model output, model conflict, and external failure must never become `pass`.
- Do not expose Google credentials or raw internal errors to the browser.
- Permit audio fetches only from exact HTTPS hosts in `ALLOWED_AUDIO_HOSTS`, initially `cdn.convly.jp`, and revalidate redirects to prevent SSRF.
- Use `ASR_CONFIDENCE_THRESHOLD=0.75` as the configurable MVP default.
- Do not add authentication, persistence, database, TTS generation, auto-fix, PDF export, batch QA, or pronunciation-dictionary UI.
- Use the approved Warm Editorial visual direction; do not use neon, blue-purple gradients, glow, or an opaque quality score.
- Display inspected count, review count, and inconclusive count instead of a quality score.
- Meet WCAG AA color contrast as a target and keep every primary action keyboard-operable at desktop and mobile widths.
- Keep AI verdicts and human resolutions as separate state.
- Use TDD for every domain and API task and commit after every task.

---

## File Structure

```text
.
├── Dockerfile
├── next.config.ts
├── package.json
├── playwright.config.ts
├── vitest.config.ts
├── public/
│   └── mark.svg
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── audio/route.ts
│   │   │   ├── content/normalize/route.ts
│   │   │   └── reviews/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.test.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── import-panel.test.tsx
│   │   ├── import-panel.tsx
│   │   ├── review-panel.test.tsx
│   │   ├── review-panel.tsx
│   │   ├── review-workspace.test.tsx
│   │   ├── review-workspace.tsx
│   │   ├── section-nav.tsx
│   │   ├── status-summary.tsx
│   │   └── transport-controls.tsx
│   ├── data/
│   │   └── pronunciation-dictionary.json
│   ├── features/
│   │   ├── audio/
│   │   │   ├── audio-fetcher.server.ts
│   │   │   ├── audio-policy.ts
│   │   │   ├── playback-reducer.ts
│   │   │   └── use-continuous-player.ts
│   │   ├── content/
│   │   │   ├── content-schema.ts
│   │   │   ├── normalize-content.ts
│   │   │   └── types.ts
│   │   ├── pronunciation/
│   │   │   ├── align-readings.ts
│   │   │   ├── canonical-reading.ts
│   │   │   ├── kana.ts
│   │   │   └── reading-converter.server.ts
│   │   └── review/
│   │       ├── gemini-reviewer.server.ts
│   │       ├── review-contract.ts
│   │       ├── review-orchestrator.server.ts
│   │       ├── speech-recognizer.server.ts
│   │       └── synthesis-review.ts
│   └── test/
│       └── setup.ts
├── tests/
│   ├── e2e/atqa.spec.ts
│   ├── fixtures/document.json
│   ├── fixtures/quiz.json
│   ├── integration/reviews-route.test.ts
│   └── unit/
│       ├── align-readings.test.ts
│       ├── audio-policy.test.ts
│       ├── canonical-reading.test.ts
│       ├── content-schema.test.ts
│       ├── gemini-reviewer.test.ts
│       ├── normalize-content.test.ts
│       ├── playback-reducer.test.ts
│       ├── review-contract.test.ts
│       ├── speech-recognizer.test.ts
│       └── synthesis-review.test.ts
└── docs/
    ├── demo-script.md
    └── operations.md
```

Responsibility boundaries:

- `content/` knows input JSON and produces `PlaybackUnit[]`; it knows nothing about UI or Google APIs.
- `pronunciation/` owns dictionary replacement, kana normalization, alignment, and canonical readings.
- `review/` owns Stage 1, Google adapter interfaces, final status rules, and structured results.
- `audio/` owns URL policy, server-side fetch, and browser playback state.
- `components/` render state and emit user intent; they do not call Google SDKs.
- API routes validate requests, call one application service, and map typed errors to safe responses.

---

### Task 1: Scaffold the application and verification harness

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Create: `public/mark.svg`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Produces: root route `/` with the accessible product title `ATQA`.

- [ ] **Step 1: Scaffold Next.js without Tailwind or a component template**

Run:

```powershell
pnpm create next-app@latest . --ts --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-tailwind
```

Expected: Next.js source files and `pnpm-lock.yaml` are created without replacing `README.md`, `docs/`, or `.gitignore`. If the scaffold refuses a non-empty directory, scaffold into `C:\tmp\atqa-next-scaffold` and copy only generated application files into this repository.

- [ ] **Step 2: Install test and runtime dependencies**

Run:

```powershell
pnpm add zod kuromoji @google-cloud/speech @google/genai
pnpm add -D vitest jsdom @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test @types/kuromoji
```

Expected: dependencies are recorded in `package.json` and pinned in `pnpm-lock.yaml`.

- [ ] **Step 3: Define verification scripts**

Set these scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 4: Configure Vitest and add a smoke test**

Create `vitest.config.ts` with `jsdom`, the React plugin, alias `@` to `src`, and setup file `src/test/setup.ts`. Create `src/app/page.test.tsx` asserting that `<Page />` exposes the heading `音声を、聴くべき場所だけに。`.

```tsx
import { render, screen } from "@testing-library/react";
import Page from "./page";

it("renders the ATQA promise", () => {
  render(<Page />);
  expect(
    screen.getByRole("heading", { name: "音声を、聴くべき場所だけに。" }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 5: Run the smoke verification**

Run:

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Expected: all four commands exit with code 0.

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-lock.yaml next.config.ts vitest.config.ts playwright.config.ts src public .gitignore
git commit -m "chore: scaffold ATQA web application"
```

---

### Task 2: Validate and normalize document and quiz inputs

**Files:**
- Create: `src/features/content/content-schema.ts`
- Create: `src/features/content/types.ts`
- Create: `src/features/content/normalize-content.ts`
- Create: `src/app/api/content/normalize/route.ts`
- Create: `tests/fixtures/document.json`
- Create: `tests/fixtures/quiz.json`
- Create: `tests/unit/content-schema.test.ts`
- Create: `tests/unit/normalize-content.test.ts`

**Interfaces:**
- Produces: `parseContent(input: unknown): ContentInput`.
- Produces: `normalizeContent(input: ContentInput): NormalizedContent`.
- Produces: `PlaybackUnit` exactly as defined in the approved spec.
- Produces: `POST /api/content/normalize` returning `NormalizeResponse`.

- [ ] **Step 1: Copy the supplied fixtures**

Copy:

```powershell
Copy-Item -LiteralPath 'C:\Users\LEGION\AppData\Local\Temp\cnt_938dda303d_doc_01.json' -Destination 'tests\fixtures\document.json'
Copy-Item -LiteralPath 'C:\Users\LEGION\AppData\Local\Temp\cnt_938dda303d_quiz_range_01.json' -Destination 'tests\fixtures\quiz.json'
```

Expected: both committed fixtures remain byte-for-byte equivalent to the supplied inputs.

- [ ] **Step 2: Write failing schema tests**

Test exact failures for unsupported `type`, `schemaVersion !== 1`, non-HTTPS `assetBaseUrl`, missing `audioPath`, invalid `answerIndex`, and mismatched `choices` / `choiceAudioPaths`.

```ts
expect(() =>
  parseContent({
    id: "x",
    type: "document",
    schemaVersion: 2,
    title: "x",
    language: "ja",
    assetBaseUrl: "https://cdn.convly.jp/root",
    documents: [],
  }),
).toThrow(/schemaVersion/);
```

- [ ] **Step 3: Run schema tests and verify RED**

Run:

```powershell
pnpm vitest run tests/unit/content-schema.test.ts
```

Expected: FAIL because `parseContent` does not exist.

- [ ] **Step 4: Implement discriminated Zod schemas**

Define `DocumentContentSchema`, `QuizContentSchema`, and `ContentSchema`. Add refinements for choice counts and `answerIndex`. Export inferred types and reject files whose serialized UTF-8 form exceeds 5 MiB in the API route before parsing.

- [ ] **Step 5: Write failing normalization tests**

Assertions:

```ts
expect(normalizeContent(documentFixture).units).toHaveLength(42);
expect(normalizeContent(quizFixture).groups).toHaveLength(30);
expect(normalizeContent(quizFixture).units).toHaveLength(180);
expect(
  normalizeContent(quizFixture).units.slice(0, 6).map((unit) => unit.kind),
).toEqual(["question", "choice", "choice", "choice", "choice", "explanation"]);
```

Also assert `q-1:choice:0`, `sourcePath`, `displayText`, optional `synthesisText`, and the completed CDN URL.

- [ ] **Step 6: Implement normalization**

Use `new URL(audioPath, normalizedBaseUrl)` and re-check protocol and hostname. Do not generate `expectedReading` yet; initialize it to `null` for Task 4.

- [ ] **Step 7: Implement the normalize route**

Return HTTP 200 with `NormalizedContent`; return HTTP 400 with:

```ts
type ValidationErrorBody = {
  error: "INVALID_CONTENT";
  issues: Array<{ path: string; message: string }>;
};
```

Never return a Zod stack trace.

- [ ] **Step 8: Verify and commit**

Run:

```powershell
pnpm vitest run tests/unit/content-schema.test.ts tests/unit/normalize-content.test.ts
pnpm typecheck
```

Expected: PASS.

```powershell
git add src/features/content src/app/api/content tests/fixtures tests/unit/content-schema.test.ts tests/unit/normalize-content.test.ts
git commit -m "feat: normalize document and quiz content"
```

---

### Task 3: Build the canonical pronunciation engine

**Files:**
- Create: `src/data/pronunciation-dictionary.json`
- Create: `src/features/pronunciation/kana.ts`
- Create: `src/features/pronunciation/reading-converter.server.ts`
- Create: `src/features/pronunciation/canonical-reading.ts`
- Create: `tests/unit/canonical-reading.test.ts`

**Interfaces:**
- Produces: `normalizeComparisonKana(value: string): string`.
- Produces: `createCanonicalReading(displayText: string): Promise<CanonicalReadingResult>`.
- Produces: `{ status: "defined"; display: string; comparison: string } | { status: "undefined"; unknownTokens: string[] }`.

- [ ] **Step 1: Add the approved dictionary verbatim**

Create `src/data/pronunciation-dictionary.json` using the 28 corrections from section 11 of the approved spec. Keep `version: 1` and `allowlist: []`.

- [ ] **Step 2: Write failing precedence and unknown-token tests**

Required tests:

```ts
expect(await createCanonicalReading(".gitignore")).toMatchObject({
  status: "defined",
  comparison: "どっとぎっといぐのあ",
});
expect(await createCanonicalReading("DDoSとDoS")).toMatchObject({
  status: "defined",
  comparison: "でぃーどすとどす",
});
expect(await createCanonicalReading("ITプロジェクト")).toMatchObject({
  status: "defined",
  comparison: "あいてぃーぷろじぇくと",
});
expect(await createCanonicalReading("UNKNOWN製品")).toEqual({
  status: "undefined",
  unknownTokens: ["UNKNOWN"],
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
pnpm vitest run tests/unit/canonical-reading.test.ts
```

Expected: FAIL because the pronunciation module does not exist.

- [ ] **Step 4: Implement deterministic normalization**

Implement NFKC normalization, longest-key-first non-overlapping replacements, katakana-to-hiragana conversion, punctuation removal for comparison, and whitespace preservation for display. Initialize kuromoji once in a cached promise and convert only non-replaced Japanese spans.

- [ ] **Step 5: Reject unresolved Latin tokens**

After dictionary replacement and Japanese conversion, detect remaining `/[A-Za-z][A-Za-z0-9._-]*/` tokens. Return `status: "undefined"` instead of asking Gemini to invent a reading.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
pnpm vitest run tests/unit/canonical-reading.test.ts
pnpm typecheck
```

Expected: all tests PASS.

```powershell
git add src/data src/features/pronunciation tests/unit/canonical-reading.test.ts
git commit -m "feat: derive canonical pronunciation readings"
```

---

### Task 4: Implement reading alignment and Stage 1 synthesis review

**Files:**
- Create: `src/features/pronunciation/align-readings.ts`
- Create: `src/features/review/review-contract.ts`
- Create: `src/features/review/synthesis-review.ts`
- Create: `tests/unit/align-readings.test.ts`
- Create: `tests/unit/synthesis-review.test.ts`
- Create: `tests/unit/review-contract.test.ts`

**Interfaces:**
- Produces: `alignReadings(expected: string, observed: string): ReadingEdit[]`.
- Produces: `reviewSynthesisText(unit: PlaybackUnit): Promise<StageReview>`.
- Produces: Zod schemas `ReviewRequestSchema`, `GeminiReviewSchema`, and `ReviewResponseSchema`.

Use these result shapes:

```ts
type StageReview = {
  status: "pass" | "review" | "inconclusive" | "not_recorded";
  issues: ReviewIssue[];
};

type ReviewResponse = {
  unitId: string;
  status: "pass" | "review" | "inconclusive";
  synthesisReview: ReviewIssue[];
  audioReview: ReviewIssue[];
  asrTranscript: string | null;
  asrConfidence: number | null;
};
```

- [ ] **Step 1: Write failing alignment tests**

Cover equal, insert, delete, replace, and duplicate sequences. Include:

```ts
expect(alignReadings("あいてぃー", "いっと")).toEqual([
  {
    operation: "replace",
    expected: "あいてぃー",
    observed: "いっと",
    expectedStart: 0,
    expectedEnd: 5,
  },
]);
```

- [ ] **Step 2: Implement a deterministic dynamic-programming aligner**

Return stable edits with `equal`, `insert`, `delete`, and `replace`. Prefer a single replacement over adjacent delete/insert when costs tie. Keep the module pure.

- [ ] **Step 3: Write failing Stage 1 tests**

Required cases:

- `SQLを実行する` expected as `えすきゅーえるをじっこうする`, synthesis text `シークエルを実行する` yields `SYNTHESIS_TEXT_MISMATCH`.
- matching synthesis yields no issue.
- missing synthesis yields `status: "not_recorded"` without an issue.
- undefined canonical reading yields `UNDEFINED_READING` and `inconclusive`.

- [ ] **Step 4: Implement Stage 1**

Normalize `synthesisText` with the same kana utility, align it to canonical comparison kana, and emit typed issues. Do not call STT or Gemini.

- [ ] **Step 5: Implement and test structured contracts**

`GeminiReviewSchema` must require:

```ts
{
  verdict: "match" | "mismatch" | "inconclusive";
  heardReading: string | null;
  reason: string;
  startSec: number | null;
  endSec: number | null;
}
```

Constrain `reason` to 300 characters and non-negative timestamps. Assert invalid JSON, negative times, and unknown verdicts are rejected.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
pnpm vitest run tests/unit/align-readings.test.ts tests/unit/synthesis-review.test.ts tests/unit/review-contract.test.ts
pnpm typecheck
```

Expected: PASS.

```powershell
git add src/features/pronunciation/align-readings.ts src/features/review tests/unit/align-readings.test.ts tests/unit/synthesis-review.test.ts tests/unit/review-contract.test.ts
git commit -m "feat: detect synthesis reading mismatches"
```

---

### Task 5: Build the continuous playback state machine

**Files:**
- Create: `src/features/audio/playback-reducer.ts`
- Create: `src/features/audio/use-continuous-player.ts`
- Create: `tests/unit/playback-reducer.test.ts`

**Interfaces:**
- Produces: `playbackReducer(state: PlaybackState, event: PlaybackEvent): PlaybackState`.
- Produces: `useContinuousPlayer(units: PlaybackUnit[])`.
- Consumes: normalized `PlaybackUnit[]` from Task 2.

Use these reducer events:

```ts
type PlaybackEvent =
  | { type: "LOAD"; index: number }
  | { type: "LOADED"; durationSec: number }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TIME"; currentTimeSec: number }
  | { type: "ENDED"; unitCount: number }
  | { type: "AUDIO_ERROR"; message: string }
  | { type: "PREVIOUS"; unitCount: number }
  | { type: "NEXT"; unitCount: number }
  | { type: "SELECT_UNIT"; index: number }
  | { type: "SET_CONTINUOUS"; enabled: boolean };
```

- [ ] **Step 1: Write failing reducer tests**

Cover:

- `LOAD → PLAY`
- `PAUSE → PLAY` without resetting `currentTimeSec`
- `ENDED` advances one index only when `continuous === true`
- final `ENDED` becomes `completed`
- `AUDIO_ERROR` stops at the current unit
- manual `NEXT` after error advances
- `SELECT_UNIT` disables stale loading state

- [ ] **Step 2: Run reducer tests and verify RED**

```powershell
pnpm vitest run tests/unit/playback-reducer.test.ts
```

Expected: FAIL because `playbackReducer` does not exist.

- [ ] **Step 3: Implement reducer and hook**

The hook owns one `HTMLAudioElement`, dispatches reducer events from `loadedmetadata`, `timeupdate`, `ended`, and `error`, and revokes listeners on unmount. It exposes:

```ts
{
  state: PlaybackState;
  play(): Promise<void>;
  pause(): void;
  previous(): void;
  next(): void;
  select(index: number): void;
  seek(seconds: number): void;
  setContinuous(enabled: boolean): void;
}
```

- [ ] **Step 4: Verify and commit**

```powershell
pnpm vitest run tests/unit/playback-reducer.test.ts
pnpm typecheck
git add src/features/audio tests/unit/playback-reducer.test.ts
git commit -m "feat: add segmented continuous playback"
```

---

### Task 6: Implement approved Import and Review Workspace UI

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Create: `src/components/import-panel.tsx`
- Create: `src/components/review-workspace.tsx`
- Create: `src/components/section-nav.tsx`
- Create: `src/components/transport-controls.tsx`
- Create: `src/components/status-summary.tsx`
- Create: `src/components/import-panel.test.tsx`
- Create: `src/components/review-workspace.test.tsx`

**Interfaces:**
- Consumes: `POST /api/content/normalize`.
- Consumes: `useContinuousPlayer(units)`.
- Produces: selected `unitId` for the review flow.

- [ ] **Step 1: Write failing UI behavior tests**

Assert that:

- JSON file selection shows title, group count, and unit count.
- document navigation lists 42 sections.
- quiz navigation groups units by 30 questions.
- continuous playback button has an accessible pressed state.
- summary shows `検査済み`, `要確認`, `判定不能`; no element contains `品質スコア`.
- invalid input renders the JSON path from the API error.

- [ ] **Step 2: Run tests and verify RED**

```powershell
pnpm vitest run src/components/import-panel.test.tsx src/components/review-workspace.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement Warm Editorial tokens**

Define CSS custom properties:

```css
:root {
  --canvas: #f4f1e9;
  --surface: #fffdf8;
  --ink: #27322c;
  --muted: #64756b;
  --line: #d8d3c8;
  --action: #355f49;
  --review: #a45a4f;
  --inconclusive: #8b7650;
  --radius: 10px;
}
```

Use a system sans-serif stack for controls and `Georgia, "Yu Mincho", serif` only for major headings. Add visible `:focus-visible` styles and responsive breakpoints at 900px and 640px.

- [ ] **Step 4: Implement the import-to-workspace flow**

Keep imported normalized content in page-level React state. Do not store it in local storage. Render Import, Understand summary, then Review Workspace. All buttons must have Japanese accessible names.

- [ ] **Step 5: Verify UI**

```powershell
pnpm vitest run src/components/import-panel.test.tsx src/components/review-workspace.test.tsx
pnpm lint
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/app src/components
git commit -m "feat: add warm editorial review workspace"
```

---

### Task 7: Secure and stream CDN audio

**Files:**
- Create: `src/features/audio/audio-policy.ts`
- Create: `src/features/audio/audio-fetcher.server.ts`
- Create: `src/app/api/audio/route.ts`
- Create: `tests/unit/audio-policy.test.ts`

**Interfaces:**
- Produces: `validateAudioUrl(rawUrl: string, allowedHosts: string[]): URL`.
- Produces: `fetchAudio(url: URL, range: string | null): Promise<Response>`.
- Produces: `GET /api/audio?url=<encoded HTTPS URL>` with Range support.

- [ ] **Step 1: Write failing security tests**

Reject:

- `http://cdn.convly.jp/file.mp3`
- `https://evil.example/file.mp3`
- `https://cdn.convly.jp.evil.example/file.mp3`
- URLs with username/password
- redirects whose final host is not allowed
- non-audio `Content-Type`
- response bodies larger than `MAX_AUDIO_BYTES`

Accept an HTTPS `cdn.convly.jp` MP3 URL and preserve `Range: bytes=0-1023`.

- [ ] **Step 2: Implement URL policy**

Parse `ALLOWED_AUDIO_HOSTS` as an exact comma-separated hostname set. Do not use suffix matching. Default `MAX_AUDIO_BYTES` to `10485760`.

- [ ] **Step 3: Implement fetch and route**

Use `redirect: "manual"` and validate every redirect before following, with at most three redirects. Forward only `Range`, `Content-Type`, `Content-Length`, `Content-Range`, and `Accept-Ranges`. Abort after 15 seconds.

- [ ] **Step 4: Verify and commit**

```powershell
pnpm vitest run tests/unit/audio-policy.test.ts
pnpm typecheck
git add src/features/audio src/app/api/audio tests/unit/audio-policy.test.ts
git commit -m "feat: securely proxy cloud audio"
```

---

### Task 8: Add Cloud Speech-to-Text and Gemini adapters

**Files:**
- Create: `src/features/review/speech-recognizer.server.ts`
- Create: `src/features/review/gemini-reviewer.server.ts`
- Create: `tests/unit/speech-recognizer.test.ts`
- Create: `tests/unit/gemini-reviewer.test.ts`

**Interfaces:**
- Produces: `SpeechRecognizer.recognize(audio: Buffer): Promise<SpeechResult>`.
- Produces: `AudioReviewer.review(input: AudioReviewInput): Promise<GeminiReview>`.
- Consumes: `GeminiReviewSchema` from Task 4.

Use:

```ts
type AudioReviewInput = {
  audio: Buffer;
  mimeType: "audio/mpeg";
  displayText: string;
  expectedReading: string;
  synthesisText: string | null;
  sttTranscript: string;
  candidateEdits: ReadingEdit[];
};
```

- [ ] **Step 1: Define adapter interfaces and failing mapping tests**

Use:

```ts
type SpeechWord = {
  text: string;
  confidence: number | null;
  startSec: number | null;
  endSec: number | null;
};

type SpeechResult = {
  transcript: string;
  confidence: number | null;
  words: SpeechWord[];
};
```

Mock Google responses and assert nanosecond duration strings map to seconds without losing nullability.

- [ ] **Step 2: Implement Speech-to-Text V2 adapter**

Create one cached `v2.SpeechClient`. Use recognizer:

```text
projects/{GOOGLE_CLOUD_PROJECT}/locations/{GOOGLE_CLOUD_LOCATION}/recognizers/_
```

Send `autoDecodingConfig`, `languageCodes: ["ja-JP"]`, word time offsets, and word confidence. Do not log audio or credentials.

- [ ] **Step 3: Write failing Gemini contract tests**

Assert that the adapter:

- sends audio, display text, expected reading, synthesis text, STT transcript, and candidate edits;
- requests JSON matching `GeminiReviewSchema`;
- rejects markdown fences, extra prose, negative timestamps, and missing `heardReading` for `mismatch`;
- truncates reason text to the schema maximum only by requesting a second valid response, not by silently accepting invalid output.

- [ ] **Step 4: Implement Gemini adapter**

Create `GoogleGenAI` in Vertex AI mode using project and location. Read the model from `GEMINI_MODEL`. Send MP3 as inline audio and use a structured response schema. The instruction must state:

```text
Judge only whether the audio pronunciation matches expectedReading.
Do not change expectedReading.
Return mismatch only when you can provide heardReading and an audio time range.
Return inconclusive when the evidence is insufficient.
```

Retry invalid structured output once; then throw `ModelOutputInvalidError`.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm vitest run tests/unit/speech-recognizer.test.ts tests/unit/gemini-reviewer.test.ts
pnpm typecheck
git add src/features/review tests/unit/speech-recognizer.test.ts tests/unit/gemini-reviewer.test.ts
git commit -m "feat: add Google audio review adapters"
```

---

### Task 9: Orchestrate Stage 1, Stage 2, and conservative verdicts

**Files:**
- Create: `src/features/review/review-orchestrator.server.ts`
- Create: `src/app/api/reviews/route.ts`
- Create: `tests/integration/reviews-route.test.ts`

**Interfaces:**
- Produces: `reviewUnit(unit, dependencies): Promise<ReviewResponse>`.
- Produces: `POST /api/reviews`.
- Consumes: canonical reading, Stage 1, audio fetcher, STT, Gemini, and review schemas.

- [ ] **Step 1: Write failing verdict matrix tests**

Cover the complete precedence:

|Canonical|Audio fetch|STT diff|Gemini|Expected|
|---|---|---|---|---|
|undefined|unused|unused|unused|inconclusive|
|defined|failed|unused|unused|inconclusive|
|defined|ok|low confidence|unused|inconclusive|
|defined|ok|match|match|pass|
|defined|ok|mismatch|mismatch|review|
|defined|ok|match|mismatch with reading/time|review|
|defined|ok|mismatch|match|inconclusive|
|defined|ok|either|invalid/failed|inconclusive|

Explicitly use expected `あいてぃー` and observed `いっと` in the mismatch cases.

- [ ] **Step 2: Implement the orchestration service**

Run Stage 1 before fetching audio. Short-circuit only when canonical reading is undefined. Run STT and Gemini for defined readings, construct typed issues, and return safe messages. Do not include human resolution in `ReviewResponse`; Task 10 stores it separately in browser session state.

- [ ] **Step 3: Implement request validation and idempotency**

Require header `Idempotency-Key` with 8–128 URL-safe characters. Keep an in-memory map of in-flight promises for duplicate submissions on the same Cloud Run instance and remove entries after completion. This prevents double-click duplication without claiming cross-instance persistence.

- [ ] **Step 4: Implement safe route responses**

Map:

- request/schema errors → 400
- forbidden audio URL → 400
- external failure already converted to `inconclusive` → 200
- unexpected internal failure → 500 `{ "error": "REVIEW_FAILED" }`

Do not include stack traces or raw provider messages.

- [ ] **Step 5: Verify and commit**

```powershell
pnpm vitest run tests/integration/reviews-route.test.ts
pnpm typecheck
git add src/features/review/review-orchestrator.server.ts src/app/api/reviews tests/integration/reviews-route.test.ts
git commit -m "feat: orchestrate conservative audio verdicts"
```

---

### Task 10: Connect review results, counters, and timestamp seeking

**Files:**
- Create: `src/components/review-panel.tsx`
- Modify: `src/components/review-workspace.tsx`
- Modify: `src/components/status-summary.tsx`
- Create: `src/components/review-panel.test.tsx`

**Interfaces:**
- Consumes: `POST /api/reviews`.
- Consumes: player `seek(seconds)`.
- Produces: session-only `reviews` and `humanResolutions` keyed by `unitId`.

- [ ] **Step 1: Write failing interaction tests**

Assert:

- clicking `この音声をAI検査` sends only the selected unit;
- duplicate clicks while pending create one request;
- `review` shows expected reading, heard reading, source stage, reason, and time;
- `問題位置から再生` calls `seek(startSec)`;
- `inconclusive` never uses the normal style or label;
- `確認済み` records a separate human resolution without changing `ReviewStatus`;
- counters derive from review records, not from all units;
- there is no quality score.

- [ ] **Step 2: Implement review state and UI**

Use `crypto.randomUUID()` as the idempotency key. Render Stage 1 and Stage 2 separately. Escape all values through normal React text rendering; never use `dangerouslySetInnerHTML`.

- [ ] **Step 3: Implement accessible status semantics**

Use `aria-live="polite"` for progress and completion, `role="alert"` only for actionable failure, text labels alongside colors, and focus the new result heading after completion.

- [ ] **Step 4: Verify and commit**

```powershell
pnpm vitest run src/components/review-panel.test.tsx src/components/review-workspace.test.tsx
pnpm lint
pnpm typecheck
git add src/components
git commit -m "feat: surface AI review evidence and seek controls"
```

---

### Task 11: End-to-end verification, Cloud Run packaging, and submission docs

**Files:**
- Create: `tests/e2e/atqa.spec.ts`
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docs/operations.md`
- Create: `docs/demo-script.md`
- Modify: `README.md`

**Interfaces:**
- Produces: reproducible local demo, production container, operator checklist, and pitch/demo script.

- [ ] **Step 1: Add deterministic E2E provider fixtures**

In Playwright, intercept:

- `/api/content/normalize` with the real normalized fixture;
- `/api/audio` with a small committed test audio asset or a generated silent WAV fixture;
- `/api/reviews` with `pass`, `review` (`IT → イット`), and `inconclusive` responses.

Do not call paid Google APIs in E2E.

- [ ] **Step 2: Write the critical E2E journey**

The test must:

1. import document JSON;
2. assert 42 units;
3. select `doc-1`;
4. start and pause playback;
5. run review;
6. see expected `アイティー` and heard `イット`;
7. seek from the issue;
8. assert `検査済み 1`, `要確認 1`, `判定不能 0`;
9. import quiz JSON;
10. assert 30 questions and the first six playback kinds in order.

- [ ] **Step 3: Run E2E and visual checks**

Run:

```powershell
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: PASS at desktop 1440×900 and mobile 390×844 projects. Capture screenshots for Import, Review, and issue states.

- [ ] **Step 4: Add production container**

Configure `next.config.ts` with `output: "standalone"`. Use a multi-stage Node container, copy standalone output and static assets, listen on `PORT=8080`, and run as a non-root user.

- [ ] **Step 5: Document operations**

`docs/operations.md` must include exact required environment variables, local ADC setup, required Google APIs, local commands, Cloud Run deploy command, retry behavior, data retention, and the four environment checks listed in the design spec.

- [ ] **Step 6: Write the three-minute demo script**

`docs/demo-script.md` must follow the approved ten-step scenario, explicitly say `IT` is misread as `イット`, show Stage 2 `AUDIO_PRONUNCIATION_SUSPECT`, switch briefly to quiz playback, and close with:

```text
全文を聞くQAから、AIが示した場所を判断するQAへ。
```

- [ ] **Step 7: Run the full completion gate**

Run:

```powershell
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
git diff --check
git status --short
```

Expected: all commands exit 0; `git status --short` contains only the Task 11 files before commit.

- [ ] **Step 8: Perform live-provider smoke verification**

With Google credentials configured:

1. fetch one real `cdn.convly.jp` MP3 through `/api/audio`;
2. run one real STT request;
3. run one real Gemini structured review;
4. confirm `IT → イット` produces `review` when the supplied audio exhibits it;
5. confirm provider failure produces `inconclusive`.

Record model name, region, audio duration, file size, latency, and result in `docs/operations.md`. If the supplied `doc-1` audio does not actually contain `イット`, do not falsify the demo; select an existing cloud-audio sample known to contain the mispronunciation and record its provenance.

- [ ] **Step 9: Commit**

```powershell
git add tests/e2e Dockerfile .dockerignore docs/operations.md docs/demo-script.md README.md next.config.ts
git commit -m "docs: package and verify ATQA demo"
```

---

## Final Review Checklist

- [ ] Every input and provider response crosses a Zod or explicit typed boundary.
- [ ] Document fixture produces 42 units.
- [ ] Quiz fixture produces 30 groups and 180 units in the approved order.
- [ ] Dictionary longest-match cases pass.
- [ ] `IT → イット` is tested as an audio-layer issue.
- [ ] Stage 1 and Stage 2 are visually and structurally separate.
- [ ] Unknown reading, low STT confidence, provider failure, invalid Gemini output, and STT/Gemini conflict are never `pass`.
- [ ] Continuous playback stops visibly on an audio error and can continue manually.
- [ ] No quality score, batch QA, persistence, login, TTS generation, or dictionary editor exists.
- [ ] Warm Editorial desktop and mobile screenshots are reviewed.
- [ ] Paid-provider smoke checks are recorded without credentials or raw audio content.
- [ ] The fixed demo completes reliably from import through timestamp seek.
