import { GoogleGenAI } from "@google/genai";

const project = process.env.GOOGLE_CLOUD_PROJECT || "ai-agent-hackathon-497119";

async function probe(location, model) {
  const ai = new GoogleGenAI({ vertexai: true, project, location });
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: "1+1は？数字のみ返答" }] }],
    });
    console.log(`[${location} / ${model}] OK:`, res.text?.slice(0, 40));
  } catch (e) {
    console.log(`[${location} / ${model}] FAILED:`, String(e.message).slice(0, 200));
  }
}

await probe("us-central1", "gemini-2.0-flash");
await probe("global", "gemini-2.0-flash");
await probe("global", "gemini-2.5-flash");
await probe("us-central1", "gemini-2.5-flash");
