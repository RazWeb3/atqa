// Reproduce review results for demo units to inspect raw API responses.
import { readFileSync } from "node:fs";

const base = process.env.ATQA_BASE_URL || "http://localhost:3000";
const sample = JSON.parse(
  readFileSync(new URL("../public/demo/atqa-demo-sample.json", import.meta.url), "utf8"),
);

const targets = process.argv.slice(2);
const ids = targets.length > 0 ? targets : ["demo-2", "demo-4"];

for (const id of ids) {
  const index = sample.documents.findIndex((d) => d.id === id);
  const doc = sample.documents[index];
  if (!doc) {
    console.error(`unit not found: ${id}`);
    continue;
  }
  const unit = {
    id: doc.id,
    groupId: doc.id,
    kind: "document",
    order: index,
    displayText: doc.text,
    synthesisText: doc.tts.text ?? null,
    expectedReading: null,
    audioUrl: `${sample.assetBaseUrl}/${doc.tts.audioPath}`,
    sourcePath: `documents[${index}]`,
  };

  const res = await fetch(`${base}/api/reviews`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `repro_${id}_${Date.now()}`,
    },
    body: JSON.stringify({ unit }),
  });
  const json = await res.json();
  console.log(`===== ${id} (HTTP ${res.status}) =====`);
  console.log(JSON.stringify(json, null, 2));
}
