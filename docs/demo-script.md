# ATQA Three-Minute Demo Script

## Preparation

- Open ATQA at http://localhost:3000 (or deployed Cloud Run URL)
- Have `document.json` and `quiz.json` fixtures ready
- Browser at 1440×900 desktop width

---

## Demo Flow

### Step 1: Introduction (10 seconds)

**Say:**
> これはATQA、Autonomous TTS Quality Assurance Agentです。
> TTS音声の品質検査を、全文を聞くQAから、AIが示した場所を判断するQAへ変えます。

**Show:** Landing page with hero title "音声を、聴くべき場所だけに。"

---

### Step 2: Import Document (15 seconds)

**Do:** Click "ドキュメントJSONを選択" and select `document.json`

**Say:**
> SokqaのドキュメントJSONを読み込みます。
> 42の再生ユニットに正規化されました。

**Show:** Workspace with 42ユニット counter

---

### Step 3: Continuous Playback (20 seconds)

**Do:** Click "再生" button, let it play briefly, then pause

**Say:**
> 連続再生で音声を聴けます。
> しかし42ユニットを全部聞くのは時間がかかります。
> ここでAI検査を使います。

**Show:** Transport controls, unit navigation

---

### Step 4: Run AI Review (20 seconds)

**Do:** Select doc-1 (ITプロジェクト...), click "この音声をAI検査"

**Say:**
> doc-1を選択して、AI検査を実行します。
> Stage 1で読み上げ原稿を、Stage 2で実音声を検査します。

**Show:** Review progress, then results

---

### Step 5: Show Mispronunciation Detection (30 seconds)

**Do:** Point to the review result

**Say:**
> 結果は「要確認」です。
> 期待読みは「あいてぃー」ですが、音声では「いっと」と発音されています。
> ITがイットと誤読されています。

**Show:**
- Status: 要確認
- Stage 2: AUDIO_PRONUNCIATION_SUSPECT
- 期待読み: あいてぃー
- 認識結果: いっと

---

### Step 6: Timestamp Seek (15 seconds)

**Do:** Click "問題位置から再生 (1.5s–2.3s)"

**Say:**
> 問題の場所から直接再生できます。
> 1.5秒から2.3秒の間に「イット」と発音されています。

**Show:** Audio seeks to timestamp

---

### Step 7: Human Resolution (15 seconds)

**Do:** Click "確認済みにする"

**Say:**
> 人間が確認したら「確認済み」にできます。
> AIの判定は変わりませんが、人間の確認状態は別に記録されます。

**Show:** ✓ 確認済み badge, AI status still 要確認

---

### Step 8: Counters (10 seconds)

**Do:** Point to status summary

**Say:**
> 検査済み1件、要確認1件、判定不能0件。
> 品質スコアではなく、確認すべき数を示します。

**Show:** Status summary counters

---

### Step 9: Quiz Playback (20 seconds)

**Do:** Click "別のファイルを読み込む", import `quiz.json`

**Say:**
> クイズも読み込めます。
> 30問、180ユニット。
> 問題、選択肢、解説の順で再生されます。

**Show:** Quiz workspace with 30問 / 180ユニット

---

### Step 10: Closing (15 seconds)

**Say:**
> ATQAは、Cloud Speech-to-TextとGeminiで音声を検査し、
> 問題のある場所だけを人間が確認できるようにします。

> **全文を聞くQAから、AIが示した場所を判断するQAへ。**

**Show:** Final state

---

## Key Points to Emphasize

1. **Conservative verdicts**: 不明な場合は必ず「判定不能」、決して「正常」にしない
2. **Two-stage QA**: 読み上げ原稿と実音声を別々に検査
3. **Evidence-based**: 期待読み、認識結果、タイムスタンプを提示
4. **Human-in-the-loop**: AIの判定と人間の確認は別の状態
5. **No quality score**: スコアではなく、確認すべき件数を表示

## Troubleshooting During Demo

- If review returns `inconclusive`: Explain this is by design when evidence is insufficient
- If audio fails to load: Check CDN availability and ALLOWED_AUDIO_HOSTS
- If STT confidence is low: This correctly triggers inconclusive, not pass
