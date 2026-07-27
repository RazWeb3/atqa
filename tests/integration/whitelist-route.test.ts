import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "@/app/api/whitelist/route";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "atqa-whitelist-route-"));
  process.env.WHITELIST_PATH = path.join(tempDir, "reading-whitelist.json");
});

afterEach(async () => {
  delete process.env.WHITELIST_PATH;
  await rm(tempDir, { recursive: true, force: true });
});

function jsonRequest(method: string, body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/whitelist", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/whitelist", () => {
  it("returns an empty list initially", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.entries).toEqual([]);
  });
});

describe("POST /api/whitelist", () => {
  it("adds an entry and returns the updated list", async () => {
    const response = await POST(
      jsonRequest("POST", { token: "Java", reading: "ジャバ" }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toMatchObject({
      token: "Java",
      reading: "ジャバ",
    });
  });

  it("rejects an empty token", async () => {
    const response = await POST(
      jsonRequest("POST", { token: "", reading: "ジャバ" }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a missing reading", async () => {
    const response = await POST(jsonRequest("POST", { token: "Java" }));
    expect(response.status).toBe(400);
  });

  it("rejects invalid JSON", async () => {
    const request = new NextRequest("http://localhost/api/whitelist", {
      method: "POST",
      body: "not json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/whitelist", () => {
  it("removes an entry and returns the updated list", async () => {
    await POST(jsonRequest("POST", { token: "Java", reading: "ジャバ" }));

    const response = await DELETE(jsonRequest("DELETE", { token: "Java" }));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.entries).toEqual([]);
  });

  it("rejects a missing token", async () => {
    const response = await DELETE(jsonRequest("DELETE", {}));
    expect(response.status).toBe(400);
  });
});
