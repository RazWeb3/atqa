import { describe, expect, it } from "vitest";
import { createCanonicalReading } from "@/features/pronunciation/canonical-reading";

describe("createCanonicalReading", () => {
  it("converts .gitignore with dictionary precedence", async () => {
    const result = await createCanonicalReading(".gitignore");
    expect(result).toMatchObject({
      status: "defined",
      comparison: "どっとぎっといぐのあ",
    });
  });

  it("converts DDoSとDoS with longest-match-first", async () => {
    const result = await createCanonicalReading("DDoSとDoS");
    expect(result).toMatchObject({
      status: "defined",
      comparison: "でぃーどすとどす",
    });
  });

  it("converts ITプロジェクト", async () => {
    const result = await createCanonicalReading("ITプロジェクト");
    expect(result).toMatchObject({
      status: "defined",
      comparison: "あいてぃーぷろじぇくと",
    });
  });

  it("returns undefined for unknown word-like Latin tokens", async () => {
    const result = await createCanonicalReading("Unknown製品");
    expect(result).toEqual({
      status: "undefined",
      unknownTokens: ["Unknown"],
    });
  });

  it("spells out all-caps acronyms letter by letter without a dictionary", async () => {
    const result = await createCanonicalReading("PDCAサイクル");
    expect(result).toMatchObject({
      status: "defined",
      comparison: "ぴーでぃーしーえーさいくる",
    });
  });

  it("spells out acronyms containing digits", async () => {
    const result = await createCanonicalReading("B2B取引");
    expect(result).toMatchObject({
      status: "defined",
      comparison: "びーつーびーとりひき",
    });
  });

  it("prefers dictionary readings over letterwise spelling", async () => {
    // PMBOK is in the dictionary as ピンボック, not letterwise
    const result = await createCanonicalReading("PMBOK");
    expect(result).toMatchObject({
      status: "defined",
      comparison: "ぴんぼっく",
    });
  });

  it("converts SQLを実行する", async () => {
    const result = await createCanonicalReading("SQLを実行する");
    expect(result).toMatchObject({
      status: "defined",
      comparison: "えすきゅーえるをじっこうする",
    });
  });

  it("converts AI and UI correctly", async () => {
    const result = await createCanonicalReading("AIとUI");
    expect(result).toMatchObject({
      status: "defined",
      comparison: "えーあいとゆーあい",
    });
  });

  it("handles pure Japanese text", async () => {
    const result = await createCanonicalReading("プロジェクト");
    expect(result).toMatchObject({
      status: "defined",
    });
    if (result.status === "defined") {
      expect(result.comparison).toBe("ぷろじぇくと");
    }
  });

  it("handles mixed content with punctuation", async () => {
    const result = await createCanonicalReading("IT、AI、UI");
    expect(result).toMatchObject({
      status: "defined",
    });
    if (result.status === "defined") {
      // Punctuation should be removed in comparison
      expect(result.comparison).not.toContain("、");
    }
  });
});
