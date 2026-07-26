import {
  getAllowedHosts,
  getMaxAudioBytes,
  isAudioContentType,
  validateRedirectUrl,
} from "./audio-policy";

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 15000;

export type AudioFetchResult = {
  body: ArrayBuffer;
  contentType: string;
  contentLength: number;
  status: number;
  contentRange: string | null;
};

/**
 * Fetch audio from a validated URL with redirect validation.
 */
export async function fetchAudio(
  url: URL,
  range: string | null,
): Promise<AudioFetchResult> {
  const allowedHosts = getAllowedHosts();
  const maxBytes = getMaxAudioBytes();

  let currentUrl = url;
  let redirectCount = 0;

  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {};
      if (range) {
        headers["Range"] = range;
      }

      const response = await fetch(currentUrl.href, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle redirects
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error("Redirect without location header");
        }

        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          throw new Error("Too many redirects");
        }

        // Validate redirect URL
        currentUrl = validateRedirectUrl(location, allowedHosts);
        continue;
      }

      // Check for successful response
      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      // Validate content type
      const contentType = response.headers.get("content-type");
      if (!isAudioContentType(contentType)) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      // Check content length
      const contentLengthHeader = response.headers.get("content-length");
      const contentLength = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : 0;

      if (contentLength > maxBytes) {
        throw new Error("Audio file too large");
      }

      // Read body
      const body = await response.arrayBuffer();

      if (body.byteLength > maxBytes) {
        throw new Error("Audio file too large");
      }

      return {
        body,
        contentType: contentType || "audio/mpeg",
        contentLength: body.byteLength,
        status: response.status,
        contentRange: response.headers.get("content-range"),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
