import { v2 } from "@google-cloud/speech";

const project = process.env.GOOGLE_CLOUD_PROJECT || "ai-agent-hackathon-497119";

const audioUrl =
  "https://cdn.convly.jp/sokqa/creators/sokqa_official/packs/cnt_938dda303d/objects/audio/av_20260721_225017_cnt_938dda303d_doc_01__doc_doc-1_020e6f59.mp3";

const res = await fetch(audioUrl);
const audio = Buffer.from(await res.arrayBuffer());
console.log("audio bytes:", audio.length);

async function tryRecognize(label, clientOptions, loc, model) {
  const client = new v2.SpeechClient(clientOptions);
  try {
    const [response] = await client.recognize({
      recognizer: `projects/${project}/locations/${loc}/recognizers/_`,
      config: {
        autoDecodingConfig: {},
        languageCodes: ["ja-JP"],
        ...(model ? { model } : {}),
        features: { enableWordTimeOffsets: true, enableWordConfidence: true },
      },
      content: audio.toString("base64"),
    });
    const alt = response.results?.[0]?.alternatives?.[0];
    console.log(`[${label}] OK transcript=`, alt?.transcript?.slice(0, 60));
    console.log(`[${label}] confidence=`, alt?.confidence);
  } catch (e) {
    console.log(`[${label}] FAILED:`, e.message?.slice(0, 300));
  } finally {
    await client.close();
  }
}

await tryRecognize("global+long", {}, "global", "long");
await tryRecognize(
  "us-central1+long",
  { apiEndpoint: "us-central1-speech.googleapis.com" },
  "us-central1",
  "long",
);
