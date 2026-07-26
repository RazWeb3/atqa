import { describe, expect, it, vi, beforeEach } from "vitest";
import { durationToSeconds } from "@/features/review/speech-recognizer.server";

// Mock the speech module
vi.mock("@google-cloud/speech", () => {
  return {
    v2: {
      SpeechClient: vi.fn().mockImplementation(() => ({
        recognize: vi.fn(),
      })),
    },
  };
});

describe("SpeechRecognizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
  });

  it("maps Duration objects with seconds and nanos to seconds", () => {
    expect(durationToSeconds({ seconds: 1, nanos: 500000000 })).toBe(1.5);
    expect(durationToSeconds({ seconds: "2", nanos: 0 })).toBe(2);
    expect(durationToSeconds({ seconds: 0, nanos: 250000000 })).toBe(0.25);
    expect(durationToSeconds({ seconds: 3 })).toBe(3);
    expect(durationToSeconds({ nanos: 750000000 })).toBe(0.75);
  });

  it("handles null and invalid duration values", () => {
    expect(durationToSeconds(null)).toBeNull();
    expect(durationToSeconds(undefined)).toBeNull();
    expect(durationToSeconds({ seconds: "invalid" })).toBeNull();
    expect(durationToSeconds({})).toBe(0);
  });
});
