# ATQA 3日版MVP 設計仕様書

## 1. 文書情報

|項目|内容|
|---|---|
|システム名|Autonomous TTS Quality Assurance Agent（ATQA）|
|文書種別|ハッカソン向けMVP設計仕様書|
|版|1.0|
|作成日|2026-07-27|
|対象期間|3日間|
|対象カテゴリー|AGENT / DESIGN ENG|
|状態|設計承認済み、実装前|

本書は、プロダクト要件、UX、データ契約、技術構成、検査ロジック、異常系、検証条件、デモ方針を一つの実装契約として定義する。

## 2. 背景と課題

クラウドTTSで多数の教材音声を生成しても、誤読、読み飛ばし、重複、音声欠損を確認するため、公開前に人が全文を試聴する必要がある。コンテンツが細かいセクションへ分割されている場合、ファイルの切り替えも確認負荷になる。

添付サンプルには次の2形式がある。

|形式|構造|実測値|音声順|
|---|---|---:|---|
|document|`documents[]`|42セクション、42音声|配列順|
|quiz|`questions[]`|30問、180音声|問題 → 選択肢0〜3 → 解説|

全音声に音声パスが存在する。一方、音声生成用テキストは一部にしか存在しない。

|形式|音声生成用テキストの実測値|
|---|---:|
|document|`tts.text` 16件|
|quiz|`questionText` 8件、`choiceTexts` 16件、`explanationText` 10件|

さらに、表示本文の `IT` に対し、音声生成用テキストが「エーアイティー」になっている例がある。正しい読み辞書では「アイティー」であるため、問題は実音声だけでなく、その前段の読み上げ原稿生成層でも発生している。

## 3. プロダクト定義

### 3.1 一文説明

原稿JSONを入れると、AIが分割音声を連続再生可能なレビュー列へ変換し、読み上げ原稿と実音声の誤読候補を根拠・再生位置付きで示す。

### 3.2 価値

人の作業を「全文を順番に聞く」から「AIが絞った箇所だけを確認する」へ変える。

### 3.3 製品の約束

- 誤読候補を抽出し、確認すべき場所を減らす。
- 問題の発生層を「読み上げ原稿生成」と「実音声」に分ける。
- 不確実な結果を正常扱いしない。
- 音声品質の完全自動保証や、人間確認の完全撤廃は主張しない。

## 4. 審査基準への対応

|審査基準|設計上の対応|
|---|---|
|AI Integration 30%|STTによる候補抽出とGeminiによる音声レビューを検査フローの中核に置く|
|Innovation & UX 30%|AIの判断、根拠、再生位置を連続プレイヤーへ統合し、要確認箇所だけを聞ける|
|Speed & Quality 20%|2入力形式、1ユニット検査、1本の安定デモへ範囲を限定する|
|Feasibility 20%|既存CDN音声、Cloud Speech-to-Text、Vertex AI Gemini、決定的な差分処理を組み合わせる|

## 5. ゴールと対象外

### 5.1 MVPのゴール

1. 任意の同形式JSONをブラウザから読み込める。
2. `document` と `quiz` を共通の再生単位へ正規化できる。
3. 分割音声を定義済みの順番で連続再生できる。
4. 表示本文と読み辞書から正しい期待読みを生成できる。
5. 音声生成用テキストの誤りを、音声検査より前に検出できる。
6. 選択中の1音声をSTTとGeminiで検査できる。
7. 結果を「正常」「要確認」「判定不能」に分け、根拠と再生位置を表示できる。

### 5.2 MVPの対象外

- 全件一括QA
- TTS生成
- 音声の自動修正または再生成
- イントネーション、感情、自然さの評価
- 音素レベルの合格保証
- ログイン、権限、チーム機能
- DB、履歴保存、ジョブ永続化
- 辞書編集UI
- PDF出力
- 複数TTSエンジンの比較

## 6. 対象ユーザーと主要シナリオ

### 6.1 対象ユーザー

- 教材・クイズコンテンツの制作者
- TTS音声の生成担当者
- 公開前の音声QA担当者

### 6.2 主要シナリオ

1. ユーザーがSokqa形式JSONを選択する。
2. システムが形式、件数、音声パス、読み上げ原稿の有無を検証する。
3. システムが再生単位へ正規化し、コンテンツ概要を表示する。
4. ユーザーがレビュー画面を開き、音声を連続再生する。
5. ユーザーが気になる1ユニットを選び、AI検査を実行する。
6. システムが読み上げ原稿QAと実音声QAを実行する。
7. ユーザーが要確認箇所を該当時刻から再生する。

## 7. UX仕様

### 7.1 デザイン方針

採用案は `Warm Editorial` とする。

- 背景：温かいオフホワイト
- 文字：濃いチャコールと深いグリーン
- 警告：彩度を抑えたテラコッタ
- 見出し：編集・校正ツールを想起させるセリフ体
- 本文・操作：可読性を優先したサンセリフ体
- ネオン、青紫グラデーション、発光表現、過剰なAIアイコンを使わない
- AIは装飾ではなく、処理状況、判断、根拠、次の操作として表現する

### 7.2 画面構成

#### 画面1：Import

- JSONファイル選択
- 対応形式の説明
- 読み込みエラー

#### 画面2：Understand

- タイトルと形式
- セクション数または問題数
- 再生音声数
- 音声パスの充足数
- 音声生成用テキストの件数
- 表示本文へフォールバックする件数

#### 画面3：Review Workspace

- 左：セクションまたは問題ナビゲーション
- 中央：表示本文、音声プレイヤー、再生進捗
- 右：読み上げ原稿QA、実音声QA、AI根拠
- 上部：検査済み件数、要確認件数、判定不能件数

品質スコアは表示しない。選択した一部しか検査していない状態で全体品質に見える数値を出さないためである。

### 7.3 主要操作

- 再生、一時停止
- 前のユニット、次のユニット
- 連続再生の開始・停止
- 現在のユニットをAI検査
- 問題位置から再生
- 要確認結果を人が確認済みにする
- 失敗したユニットを再試行

### 7.4 アクセシビリティ

- 色だけで状態を区別せず、ラベルとアイコンを併記する。
- すべての操作をキーボードで実行可能にする。
- フォーカスリングを表示する。
- 音声の状態をテキストでも通知する。
- コントラストはWCAG AA相当を目標とする。

## 8. 連続再生仕様

### 8.1 共通状態

```text
idle → loading → playing ⇄ paused
                    ↓
                  ended → 次ユニットのloading
                    ↓
                  completed

任意の状態 → error
```

状態は以下を持つ。

```ts
type PlaybackState = {
  status: "idle" | "loading" | "playing" | "paused" | "error" | "completed";
  unitIndex: number;
  currentTimeSec: number;
  durationSec: number | null;
  continuous: boolean;
  errorCode?: string;
};
```

### 8.2 document

`documents[]` の配列順を再生順とする。現在ユニットの `ended` で次の要素へ進む。最後の要素終了後は `completed` とする。

### 8.3 quiz

各問題を次の順で展開する。

```text
question
→ choice:0
→ choice:1
→ choice:2
→ choice:3
→ explanation
```

問題間は `q-1:explanation → q-2:question` の順に接続する。選択肢数は4固定と仮定せず、`choices[]` の実数に従う。`choiceAudioPaths.length` は `choices.length` と一致しなければならない。

### 8.4 エラー時

- 音声取得に失敗したユニットはエラー表示する。
- 連続再生中はユーザー設定により再試行またはスキップできる。
- MVPの初期値は「停止」とする。音声欠損を見落とさないためである。
- ユーザーが「次へ」を押すと後続ユニットを再生できる。

## 9. 入力データ契約

### 9.1 共通ルート

必須項目：

```ts
type ContentRoot = {
  id: string;
  type: "document" | "quiz";
  schemaVersion: 1;
  title: string;
  language: "ja";
  assetBaseUrl: string;
};
```

制約：

- JSONファイル上限は5 MiBとする。
- `assetBaseUrl` はHTTPS必須。
- MVPでは取得先ホストを `cdn.convly.jp` に限定する。
- `..`、バックスラッシュ、スキームを含む `audioPath` を拒否する。
- 完成URLは `new URL(audioPath, assetBaseUrl + "/")` で構築し、再度ホストを検証する。

### 9.2 document

```ts
type DocumentItem = {
  id: string;
  text: string;
  tts: {
    text?: string;
    audioPath: string;
  };
};
```

### 9.3 quiz

```ts
type QuizQuestion = {
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
```

制約：

- `answerIndex` は `choices` の有効な添字でなければならない。
- `choiceTexts` が存在する場合は `choices` と同数でなければならない。
- `choiceAudioPaths` は `choices` と同数でなければならない。

## 10. 共通ドメインモデル

```ts
type PlaybackUnitKind =
  | "document"
  | "question"
  | "choice"
  | "explanation";

type PlaybackUnit = {
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
```

- `displayText`：利用者に見せる原文
- `synthesisText`：実際にTTSへ渡した記録。正解契約ではない
- `expectedReading`：表示本文と読み辞書から生成した正解契約
- `groupId`：documentでは項目ID、quizでは問題ID
- `sourcePath`：入力JSON上の位置。検証エラー表示に使う

## 11. 読み辞書

### 11.1 形式

```json
{
  "version": 1,
  "corrections": {
    "PostgreSQL": "ポストグレスキューエル",
    ".gitignore": "ドット ギットイグノア",
    "git init": "ギット イニット",
    "担います": "にないます",
    "表形式": "ひょうけいしき",
    "PMBOK": "ピンボック",
    "DDoS": "ディードス",
    "IPv6": "アイピーブイシックス",
    "IPv4": "アイピーブイフォー",
    "WPA3": "ダブリューピーエースリー",
    "WPA2": "ダブリューピーエーツー",
    "NAPT": "ナプト",
    ".json": "ドット ジェイソン",
    "Sokqa": "ソッカ",
    ".env": "ドット イーエヌブイ",
    ".git": "ドット ギット",
    "JSON": "ジェイソン",
    "NDA": "エヌディーエー",
    "ROE": "アールオーイー",
    "MOT": "エムオーティー",
    "AES": "エーイーエス",
    "SQL": "エスキューエル",
    "NAT": "ナット",
    "DoS": "ドス",
    "AI": "エーアイ",
    "IT": "アイティー",
    "UI": "ユーアイ",
    "UX": "ユーエックス"
  },
  "allowlist": []
}
```

### 11.2 適用規則

1. キーは大文字小文字を区別する。
2. 長いキーを先に適用する。
3. 同一範囲へ複数キーを重ねて適用しない。
4. `.gitignore` を `.git` より先に適用する。
5. `DDoS` を `DoS` より先に適用する。
6. 辞書置換した範囲を形態素解析で再解釈しない。
7. `allowlist` は複数読みを許容する項目として将来拡張する。MVPでは空配列のみ受理する。

## 12. 期待読み生成

### 12.1 正解の優先順位

期待読みは `displayText + corrections` から生成する。`synthesisText` を期待値として使用しない。

### 12.2 処理

1. UnicodeをNFKCへ正規化する。
2. 辞書キーを長さの降順で検索し、対応する読みへ置換する。
3. 残りの日本語を形態素解析でかなへ変換する。
4. カタカナをひらがなへ統一する。
5. 比較用表現では空白、句読点、括弧を除外する。
6. 表示用表現では単語境界を保持する。
7. 辞書にないラテン文字列・固有名詞が残った場合、`expectedReading = null` とし、判定不能理由を `UNDEFINED_READING` とする。

日本語読み変換にはNode.js上で動作する辞書ベースの形態素解析器を使う。AIだけで正解読みを生成しない。

## 13. 二段階QA

### 13.1 Stage 1：読み上げ原稿QA

対象：

```text
expectedReading vs synthesisText
```

`synthesisText` がない場合は `NOT_RECORDED` とし、Stage 1をスキップする。`displayText` を `synthesisText` の代用にはしない。

両者を同じ比較用かなへ正規化し、文字列アラインメントを行う。

検出：

- 置換
- 欠落
- 余分な読み
- 重複

例：

```text
表示本文：ITプロジェクト
期待読み：あいてぃーぷろじぇくと
生成記録：えーあいてぃーぷろじぇくと
結果：SYNTHESIS_TEXT_MISMATCH
```

### 13.2 Stage 2：実音声QA

1. サーバーが許可済みCDNからMP3を取得する。
2. Cloud Speech-to-Textで日本語転写、単語信頼度、単語時間を取得する。
3. STT転写を期待読みと同じ方法で正規化する。
4. 決定的な差分処理で候補範囲を抽出する。
5. GeminiへMP3、期待読み、表示本文、音声生成用テキスト、STT結果、候補範囲を渡す。
6. Geminiは構造化JSONで「一致」「不一致」「判断不能」、聞こえた読み、理由、推定時間を返す。
7. サーバーはGemini出力をスキーマ検証し、最終状態を決定する。

### 13.3 Geminiの役割

Geminiは正解読みを決めない。辞書由来の期待読みを上書きしない。次の限定された役割を担う。

- 音声を直接聞いて候補差分を二次確認する。
- ASR誤認識の可能性を評価する。
- 人が確認できる短い根拠を生成する。
- 問題位置の推定を補助する。

### 13.4 判定規則

```ts
type ReviewStatus = "pass" | "review" | "inconclusive";
```

判定は次の順序で評価し、先に一致した条件を採用する。

|条件|状態|
|---|---|
|音声取得失敗|判定不能|
|期待読み未定義|判定不能|
|STT低信頼度または結果なし|判定不能|
|Gemini出力不正またはAPI失敗|判定不能|
|機械差分なし、Geminiも一致を支持|正常|
|機械差分あり、Geminiも不一致を支持|要確認|
|機械差分なし、Geminiが時間・聞こえた読み付きで不一致を支持|要確認|
|機械差分あり、Geminiが一致を支持|判定不能（ASRとGeminiが不一致）|

正常系はSTT由来の機械比較とGeminiの両方が一致した場合だけ確定する。Gemini単独で正常へ変更しない。一方、STTが表記を自動補正して差分を失う可能性があるため、Geminiが聞こえた読みと時間を伴って不一致を示した場合は要確認にできる。

### 13.5 人による解決

ユーザーは要確認結果を「確認済み」にできる。この操作はAIの `ReviewStatus` を `pass` に変更しない。セッション内に人の確認結果を別フィールドとして保持し、モデル判定と人の判断を混同しない。

## 14. 問題モデル

```ts
type IssueCode =
  | "SYNTHESIS_TEXT_MISMATCH"
  | "AUDIO_PRONUNCIATION_SUSPECT"
  | "OMISSION_SUSPECT"
  | "DUPLICATION_SUSPECT"
  | "UNDEFINED_READING"
  | "LOW_ASR_CONFIDENCE"
  | "ASR_GEMINI_CONFLICT"
  | "AUDIO_FETCH_FAILED"
  | "MODEL_OUTPUT_INVALID";

type ReviewIssue = {
  code: IssueCode;
  status: "review" | "inconclusive";
  sourceStage: "synthesis_text" | "audio";
  expected: string | null;
  observed: string | null;
  startSec: number | null;
  endSec: number | null;
  reason: string;
};
```

`reason` はAIの自由文をそのまま信用せず、最大文字数を制限し、HTMLとして解釈しない。

## 15. API仕様

### 15.1 `POST /api/content/normalize`

入力：JSONファイル

出力：

```ts
type NormalizeResponse = {
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
```

### 15.2 `GET /api/audio`

入力：検証済み音声URL

処理：

- HTTPSと許可ホストを再検証する。
- Content-Typeが音声であることを確認する。
- サイズ上限を超えるレスポンスを停止する。
- Rangeリクエストを中継し、シークを可能にする。

### 15.3 `POST /api/reviews`

入力：

```ts
type ReviewRequest = {
  unit: PlaybackUnit;
};
```

出力：

```ts
type ReviewResponse = {
  unitId: string;
  status: ReviewStatus;
  synthesisReview: ReviewIssue[];
  audioReview: ReviewIssue[];
  asrTranscript: string | null;
  asrConfidence: number | null;
};
```

MVPではリクエストを同期処理する。処理中の二重送信をUIとサーバーの冪等キーで防ぐ。

## 16. 技術構成

### 16.1 アプリケーション

- Next.js App Router
- TypeScript
- React
- カスタムデザイントークンによるWarm Editorial UI
- スキーマ検証ライブラリ
- Node.js対応の日本語形態素解析器

### 16.2 Google Cloud

- Cloud Run：WebアプリとAPI
- Cloud Speech-to-Text：転写、信頼度、単語時間
- Vertex AI Gemini Flash系モデル：音声レビュー
- Application Default Credentials / Cloud Runサービスアカウント

Geminiモデル名は環境変数 `GEMINI_MODEL` で指定し、実装時に対象リージョンで利用可能なFlash系モデルを選ぶ。モデル更新をコード変更なしで行えるようにする。

### 16.3 環境変数

```text
GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_LOCATION
GEMINI_MODEL
ALLOWED_AUDIO_HOSTS=cdn.convly.jp
MAX_AUDIO_BYTES
ASR_CONFIDENCE_THRESHOLD
```

秘密情報をクライアントへ埋め込まない。

## 17. セキュリティと入力境界

- JSONを信頼せず、全フィールドをサーバーで検証する。
- 外部音声URLは許可ホスト方式で制限し、SSRFを防ぐ。
- リダイレクト後のURLも再検証する。
- HTMLへ表示するAI出力と入力テキストをエスケープする。
- 音声サイズとJSONサイズを制限する。
- APIタイムアウトと同時実行数を制限する。
- エラーへ認証情報、内部URL、モデルの生レスポンスを含めない。
- 一時取得した音声はリクエスト終了後に破棄し、MVPでは永続保存しない。

## 18. エラー処理

|事象|ユーザー表示|動作|
|---|---|---|
|JSON構文不正|行・列を含む読込失敗|取込停止|
|スキーマ不一致|JSONパスと期待値|取込停止|
|未対応type|対応形式を表示|取込停止|
|音声パス欠損|対象ユニットを明示|取込停止|
|CDN取得失敗|音声を取得できない|当該ユニット停止、再試行可能|
|STT失敗|音声認識に失敗|判定不能、再試行可能|
|Gemini失敗|AIレビューに失敗|判定不能、再試行可能|
|構造化出力不正|AIレビュー形式不正|1回再試行後、判定不能|
|未知語|期待読み未定義|辞書登録が必要と表示|
|連続再生中の音声エラー|現在位置で停止|明示操作で次へ移動|

リトライは復旧策であり、根本対策ではない。入力不正と不正URLは再試行せず、構造上処理経路へ入れない。

## 19. 状態管理

MVPではブラウザセッション内のみ保持する。

```ts
type AppState = {
  content: NormalizedContent | null;
  units: PlaybackUnit[];
  playback: PlaybackState;
  reviews: Record<string, ReviewResponse>;
  humanResolutions: Record<string, "confirmed_issue" | "dismissed_issue">;
  selectedUnitId: string | null;
};
```

- ページ再読込で状態は消える。
- 音声検査結果は `unitId` 単位で保持する。
- 同一ユニットの再検査時は最新結果へ置換する。
- 人の確認結果はAI判定と別に保持する。
- 連続再生状態とQA実行状態を分離し、検査失敗がプレイヤー全体を壊さないようにする。

## 20. 自動テスト

### 20.1 入力と正規化

- documentサンプルを42ユニットへ変換する。
- quizサンプルを30グループ、180ユニットへ変換する。
- quizの順番が問題、全選択肢、解説になる。
- `choiceAudioPaths` の数違いを拒否する。
- 不正type、schemaVersion、URLを拒否する。

### 20.2 辞書と期待読み

- 長いキーが優先される。
- `.gitignore` が `.git` に分割されない。
- `DDoS` が `DoS` に部分一致しない。
- `IT` が「あいてぃー」へ正規化される。
- 未知のラテン文字列が判定不能になる。

### 20.3 読み上げ原稿QA

- `ITプロジェクト` と「エーアイティープロジェクト」の差分を検出する。
- 一致する読み上げ原稿を正常とする。
- `synthesisText` 欠損時にStage 1をスキップする。

### 20.4 連続再生

- documentの末尾まで順番に進む。
- quizで選択肢数に応じて順番に進む。
- 一時停止後に同じ位置から再開する。
- エラー時に停止し、次へ手動移動できる。

### 20.5 API

- STTとGeminiをモックし、正常、要確認、競合、失敗を再現する。
- Geminiの不正JSONを正常扱いしない。
- 許可外ホストとリダイレクトを拒否する。
- 同一冪等キーの二重実行を防ぐ。

## 21. 手動・意味レビュー

AI音声判定は機械テストだけで品質を保証できないため、次の固定デモ音声で意味レビューする。

1. 正しい発音の音声
2. `IT` を「エーアイティー」と読む音声
3. 読み飛ばしを含む音声
4. STTが低信頼度になる音声

各ケースで、期待状態、根拠、再生位置が人の聴感と一致することを確認する。

## 22. 完了条件

- 添付documentを42ユニットとして取り込める。
- 添付quizを30問、180ユニットとして取り込める。
- 両形式で連続再生順が正しい。
- `doc-1` の読み上げ原稿生成ミスを検出できる。
- 選択音声をGoogle基盤で検査できる。
- 要確認結果から該当位置を再生できる。
- 正常、要確認、判定不能、API失敗を再現できる。
- UIがデスクトップとモバイル幅で破綻しない。
- 主要操作をキーボードで実行できる。
- デモ用固定シナリオを通しで再現できる。

## 23. 3日間の進行

### Day 1：入力・正規化・連続再生

- Next.js基盤
- JSONスキーマ
- document / quiz正規化
- プレイヤー状態機械
- 添付データで再生順を検証

### Day 2：二段階QA

- 読み辞書と正規化
- 読み上げ原稿QA
- Cloud Speech-to-Text
- Gemini構造化レビュー
- 判定契約と異常系

### Day 3：UX・検証・提出

- Warm Editorial UI
- 問題位置から再生
- 回帰テスト
- デモ用固定データ
- デモ動画
- プレゼン資料

機能が遅延した場合の削減順は、波形描画、モバイル微調整、複数結果の一覧性とする。二段階QA、連続再生、異常を正常扱いしない判定契約は削らない。

## 24. デモシナリオ

1. document JSONを投入する。
2. 42セクションと42音声を自動認識した画面を見せる。
3. 連続再生で分割ファイルを意識せず聞けることを示す。
4. `doc-1` を検査する。
5. 原文 `IT` の期待読みが「アイティー」であることを示す。
6. 音声生成用テキストの「エーアイティー」をStage 1で検出する。
7. 実音声をSTTとGeminiで検査する。
8. 要確認箇所から再生する。
9. 人が全文ではなく、AIが示した短い範囲だけを確認する価値を伝える。
10. quizへ切り替え、問題、選択肢、解説の連続再生を短く見せる。

## 25. プレゼンの主張

### 解決課題

TTS生成は速くなったが、公開前QAは人が全文を聞くままである。

### AIネイティブな変化

AIチャットを追加するのではなく、AIがコンテンツ構造を理解し、音声を聞き、差分を根拠付きで再生位置へ結びつける。人の操作単位そのものを「全文試聴」から「要確認箇所の判断」へ変える。

### 使用AI

- Cloud Speech-to-Text：音声認識、信頼度、時間情報
- Vertex AI Gemini：期待読みに対する音声の二次レビューと根拠生成
- Codex：設計・実装・検証のAI駆動開発

### 実現可能性

既存のクラウド音声を再利用し、選択した短い音声だけを既存Google Cloud APIで解析する。研究用の音素モデルを新規開発しない。

## 26. リスクと残存課題

|リスク|対策|残存リスク|
|---|---|---|
|ASRが誤読を正しい単語へ補正|かな差分とGemini音声レビューを併用|両方が同じ補正を行う可能性|
|Gemini判定の揺れ|構造化出力、限定された役割、固定デモ|同一音声でも理由表現が変わる可能性|
|未知語の期待読みがない|判定不能として辞書登録を促す|辞書整備の運用が必要|
|CDNのCORSやRange対応|同一オリジンの音声プロキシ|CDN障害時は再生・検査不可|
|Cloud APIの遅延|1ユニット検査、進捗表示、再試行|デモ時のネットワーク依存|
|音声時刻の誤差|STT時刻とGemini推定を併記|音素単位の精密位置ではない|

## 27. 未確認事項

次は設計上の未決定ではなく、実装開始時に環境で検証する項目である。

- 対象Google Cloudプロジェクトで利用可能なGemini Flash系モデル
- Cloud Speech-to-Textの対象モデルとリージョン
- CDNがRangeリクエストへ返す実レスポンス
- サンプルMP3の最大時間と最大ファイルサイズ

これらの失敗時にも仕様上は判定不能または音声取得エラーとなり、正常扱いしない。

## 28. 参照

- [Google Cloud Speech-to-Text RecognitionConfig](https://docs.cloud.google.com/speech-to-text/docs/v1/reference/rest/v1/RecognitionConfig?hl=ja)
- [Cloud Speech-to-Text word timestamps](https://docs.cloud.google.com/speech-to-text/docs/v1/async-time-offsets?hl=ja)
- [Gemini Audio Understanding](https://ai.google.dev/gemini-api/docs/audio?hl=en)
