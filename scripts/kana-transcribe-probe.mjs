// Transcribe demo audio to raw kana with Gemini to verify what the audio
// actually says (bypassing STT auto-correction).
import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";

const project = process.env.GOOGLE_CLOUD_PROJECT || "ai-agent-hackathon-497119";
const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const sample = JSON.parse(
  readFileSync(new URL("../public/demo/atqa-demo-sample.json", import.meta.url), "utf8"),
);

const ai = new GoogleGenAI({ vertexai: true, project, location });

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["demo-2", "demo-4"];

for (const id of ids) {
  const doc = sample.documents.find((d) => d.id === id);
  const url = `${sample.assetBaseUrl}/${doc.tts.audioPath}`;
  const audio = Buffer.from(await (await fetch(url)).arrayBuffer());
  const res = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "audio/mpeg", data: audio.toString("base64") } },
          {
            text: "この音声を、聞こえたとおりに全てひらがなで転写してください。漢字や英字は使わず、実際に発音された音をそのまま書いてください。転写のみ出力。",
          },
        ],
      },
    ],
  });
  console.log(`===== ${id} =====`);
  console.log(res.text);
}
