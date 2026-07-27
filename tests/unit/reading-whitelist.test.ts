import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addWhitelistEntry,
  loadWhitelist,
  removeWhitelistEntry,
} from "@/features/review/reading-whitelist.server";

let tempDir: string;
let filePath: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "atqa-whitelist-"));
  filePath = path.join(tempDir, "reading-whitelist.json");
  process.env.WHITELIST_PATH = filePath;
});

afterEach(async () => {
  delete process.env.WHITELIST_PATH;
  await rm(tempDir, { recursive: true, force: true });
});

describe("loadWhitelist", () => {
  it("returns an empty list when the file does not exist", async () => {
    expect(await loadWhitelist()).toEqual([]);
  });

  it("returns an empty list for corrupt JSON", async () => {
    await writeFile(filePath, "not json", "utf8");
    expect(await loadWhitelist()).toEqual([]);
  });

  it("filters out malformed entries", async () => {
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        entries: [
          { token: "Java", reading: "ジャバ", addedAt: "2026-07-27" },
          { token: "", reading: "から", addedAt: "2026-07-27" },
          { token: "NoReading" },
        ],
      }),
      "utf8",
    );

    const entries = await loadWhitelist();
    expect(entries).toHaveLength(1);
    expect(entries[0].token).toBe("Java");
  });
});

describe("addWhitelistEntry", () => {
  it("adds an entry and persists it to disk", async () => {
    const entries = await addWhitelistEntry("Java", "ジャバ");

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ token: "Java", reading: "ジャバ" });
    expect(entries[0].addedAt).toBeTruthy();

    const raw = JSON.parse(await readFile(filePath, "utf8"));
    expect(raw.version).toBe(1);
    expect(raw.entries).toHaveLength(1);
  });

  it("replaces the reading when the token already exists", async () => {
    await addWhitelistEntry("Java", "ジャバ");
    const entries = await addWhitelistEntry("Java", "じゃゔぁ");

    expect(entries).toHaveLength(1);
    expect(entries[0].reading).toBe("じゃゔぁ");
  });

  it("keeps entries sorted by token", async () => {
    await addWhitelistEntry("Python", "パイソン");
    const entries = await addWhitelistEntry("Java", "ジャバ");

    expect(entries.map((e) => e.token)).toEqual(["Java", "Python"]);
  });
});

describe("removeWhitelistEntry", () => {
  it("removes the entry for the token", async () => {
    await addWhitelistEntry("Java", "ジャバ");
    await addWhitelistEntry("Python", "パイソン");

    const entries = await removeWhitelistEntry("Java");
    expect(entries.map((e) => e.token)).toEqual(["Python"]);
  });

  it("is a no-op for unknown tokens", async () => {
    await addWhitelistEntry("Java", "ジャバ");
    const entries = await removeWhitelistEntry("Ruby");
    expect(entries).toHaveLength(1);
  });
});
