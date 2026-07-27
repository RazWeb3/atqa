import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseContent } from "@/features/content/content-schema";
import { normalizeContent } from "@/features/content/normalize-content";

// The demo sample ships with the app (public/demo) and is loaded by the
// DemoPanel, so it must always satisfy the content schema.
describe("demo sample", () => {
  it("parses and normalizes into 5 alternating units", async () => {
    const raw = await readFile(
      join(process.cwd(), "public", "demo", "atqa-demo-sample.json"),
      "utf-8",
    );
    const parsed = parseContent(JSON.parse(raw));

    expect(parsed.type).toBe("document");

    const normalized = normalizeContent(parsed);
    expect(normalized.content.unitCount).toBe(5);
    expect(normalized.units.map((u) => u.id)).toEqual([
      "demo-1",
      "demo-2",
      "demo-3",
      "demo-4",
      "demo-5",
    ]);
    // Every unit resolves to an HTTPS audio URL on the allowed CDN host.
    for (const unit of normalized.units) {
      expect(unit.audioUrl).toMatch(/^https:\/\/cdn\.convly\.jp\/.+\.mp3$/);
    }
  });
});
