import { describe, expect, it } from "vitest";
import {
  getAllowedHosts,
  isAudioContentType,
  validateAudioUrl,
} from "@/features/audio/audio-policy";

describe("validateAudioUrl", () => {
  const allowedHosts = ["cdn.convly.jp"];

  it("accepts valid HTTPS URL from allowed host", () => {
    const url = validateAudioUrl(
      "https://cdn.convly.jp/audio/test.mp3",
      allowedHosts,
    );
    expect(url.hostname).toBe("cdn.convly.jp");
  });

  it("rejects HTTP URL", () => {
    expect(() =>
      validateAudioUrl("http://cdn.convly.jp/file.mp3", allowedHosts),
    ).toThrow(/HTTPS/);
  });

  it("rejects URL from non-allowed host", () => {
    expect(() =>
      validateAudioUrl("https://evil.example/file.mp3", allowedHosts),
    ).toThrow(/not allowed/);
  });

  it("rejects URL with subdomain spoofing", () => {
    expect(() =>
      validateAudioUrl(
        "https://cdn.convly.jp.evil.example/file.mp3",
        allowedHosts,
      ),
    ).toThrow(/not allowed/);
  });

  it("rejects URL with credentials", () => {
    expect(() =>
      validateAudioUrl(
        "https://user:pass@cdn.convly.jp/file.mp3",
        allowedHosts,
      ),
    ).toThrow(/credentials/);
  });

  it("rejects invalid URL format", () => {
    expect(() => validateAudioUrl("not-a-url", allowedHosts)).toThrow(
      /Invalid URL/,
    );
  });

  it("performs exact host matching", () => {
    // Should not match partial hosts
    expect(() =>
      validateAudioUrl("https://cdn.convly.jp.evil.com/file.mp3", allowedHosts),
    ).toThrow(/not allowed/);

    expect(() =>
      validateAudioUrl("https://prefix-cdn.convly.jp/file.mp3", allowedHosts),
    ).toThrow(/not allowed/);
  });
});

describe("isAudioContentType", () => {
  it("accepts audio/mpeg", () => {
    expect(isAudioContentType("audio/mpeg")).toBe(true);
  });

  it("accepts audio/mp3", () => {
    expect(isAudioContentType("audio/mp3")).toBe(true);
  });

  it("accepts audio/wav", () => {
    expect(isAudioContentType("audio/wav")).toBe(true);
  });

  it("accepts application/octet-stream", () => {
    expect(isAudioContentType("application/octet-stream")).toBe(true);
  });

  it("rejects text/html", () => {
    expect(isAudioContentType("text/html")).toBe(false);
  });

  it("rejects null", () => {
    expect(isAudioContentType(null)).toBe(false);
  });
});

describe("getAllowedHosts", () => {
  it("returns default hosts when env not set", () => {
    const originalEnv = process.env.ALLOWED_AUDIO_HOSTS;
    delete process.env.ALLOWED_AUDIO_HOSTS;

    const hosts = getAllowedHosts();
    expect(hosts).toContain("cdn.convly.jp");

    if (originalEnv) {
      process.env.ALLOWED_AUDIO_HOSTS = originalEnv;
    }
  });
});
