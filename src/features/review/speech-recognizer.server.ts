import { v2 } from "@google-cloud/speech";

export type SpeechWord = {
  text: string;
  confidence: number | null;
  startSec: number | null;
  endSec: number | null;
};

export type SpeechResult = {
  transcript: string;
  confidence: number | null;
  words: SpeechWord[];
};

// Cache the speech client per API endpoint
const speechClients = new Map<string, v2.SpeechClient>();

function getSpeechLocation(): string {
  // Cloud STT V2 with the `_` recognizer supports ja-JP on the global
  // location; regional endpoints are opt-in via SPEECH_LOCATION.
  return process.env.SPEECH_LOCATION || "global";
}

function getSpeechClient(location: string): v2.SpeechClient {
  const endpoint =
    location === "global"
      ? "speech.googleapis.com"
      : `${location}-speech.googleapis.com`;
  let client = speechClients.get(endpoint);
  if (!client) {
    client = new v2.SpeechClient({ apiEndpoint: endpoint });
    speechClients.set(endpoint, client);
  }
  return client;
}

/**
 * Convert a Cloud STT V2 Duration ({ seconds, nanos }) to seconds.
 */
export function durationToSeconds(
  duration?: {
    seconds?: string | number | Long | null;
    nanos?: number | null;
  } | null,
): number | null {
  if (duration === null || duration === undefined) return null;
  const seconds = duration.seconds != null ? Number(duration.seconds) : 0;
  const nanos = duration.nanos != null ? Number(duration.nanos) : 0;
  if (isNaN(seconds) || isNaN(nanos)) return null;
  return seconds + nanos / 1_000_000_000;
}

/**
 * Recognize speech from audio buffer using Cloud Speech-to-Text V2.
 */
export async function recognizeSpeech(
  audio: Buffer,
): Promise<SpeechResult> {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = getSpeechLocation();
  const client = getSpeechClient(location);

  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT environment variable is required");
  }

  const recognizer = `projects/${project}/locations/${location}/recognizers/_`;

  const request = {
    recognizer,
    config: {
      autoDecodingConfig: {},
      languageCodes: ["ja-JP"],
      model: "long",
      features: {
        enableWordTimeOffsets: true,
        enableWordConfidence: true,
      },
    },
    content: audio.toString("base64"),
  };

  const [response] = await client.recognize(request);

  const result = response.results?.[0];
  const alternative = result?.alternatives?.[0];

  if (!alternative) {
    return {
      transcript: "",
      confidence: null,
      words: [],
    };
  }

  const words: SpeechWord[] =
    alternative.words?.map((word) => ({
      text: word.word || "",
      confidence: word.confidence ?? null,
      startSec: durationToSeconds(word.startOffset),
      endSec: durationToSeconds(word.endOffset),
    })) || [];

  return {
    transcript: alternative.transcript || "",
    confidence: alternative.confidence ?? null,
    words,
  };
}
