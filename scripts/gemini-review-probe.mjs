import { GoogleGenAI } from "@google/genai";

const project = process.env.GOOGLE_CLOUD_PROJECT || "ai-agent-hackathon-497119";
const location = "us-central1";
const model = "gemini-2.5-flash";

const audioUrl =
  "https://cdn.convly.jp/sokqa/creators/sokqa_official/packs/cnt_938dda303d/objects/audio/av_20260721_225017_cnt_938dda303d_doc_01__doc_doc-1_020e6f59.mp3";
const res = await fetch(audioUrl);
const audio = Buffer.from(await res.arrayBuffer());

const ai = new GoogleGenAI({ vertexai: true, project, location });

const responseSchema = {
  type: "OBJECT",
  properties: {
    verdict: { type: "STRING", enum: ["match", "mismatch", "inconclusive"] },
    heardReading: { type: "STRING", nullable: true },
    reason: { type: "STRING" },
    startSec: { type: "NUMBER", nullable: true },
    endSec: { type: "NUMBER", nullable: true },
  },
  required: ["verdict", "heardReading", "reason", "startSec", "endSec"],
};

const prompt = `表示本文: ITパスポートの学習では、ITプロジェクトの全体像と、それを効果的に管理するマネジメントの基礎知識が不可欠です。
期待読み: あいてぃーぱすぽーとのがくしゅうでは、あいてぃーぷろじぇくとのぜんたいぞうと、それをこうかてきにかんりするまねじめんとのきそちしきがふかけつです。
STT転写結果: IT パスポートの学習では aip Project の全体像とそれを効果的に管理するマネジメントの基礎知識が不可欠です

音声を聞いて、期待読みと実際の発音が一致するか判定してください。JSON形式で回答してください。`;

try {
  const start = Date.now();
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "audio/mpeg", data: audio.toString("base64") } },
          { text: prompt },
        ],
      },
    ],
    config: {
      systemInstruction:
        "Judge only whether the audio pronunciation matches expectedReading. Return inconclusive when the evidence is insufficient.",
      responseMimeType: "application/json",
      responseSchema,
    },
  });
  console.log("latency:", Date.now() - start, "ms");
  console.log("text:", response.text);
} catch (e) {
  console.log("FAILED:", String(e.message).slice(0, 400));
}
