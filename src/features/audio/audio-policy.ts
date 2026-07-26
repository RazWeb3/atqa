const DEFAULT_ALLOWED_HOSTS = ["cdn.convly.jp"];
const DEFAULT_MAX_AUDIO_BYTES = 10485760; // 10 MiB

/**
 * Parse allowed hosts from environment variable or use defaults.
 */
export function getAllowedHosts(): string[] {
  const envHosts = process.env.ALLOWED_AUDIO_HOSTS;
  if (!envHosts) {
    return DEFAULT_ALLOWED_HOSTS;
  }
  return envHosts
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
}

/**
 * Get max audio bytes from environment variable or use default.
 */
export function getMaxAudioBytes(): number {
  const envMax = process.env.MAX_AUDIO_BYTES;
  if (!envMax) {
    return DEFAULT_MAX_AUDIO_BYTES;
  }
  const parsed = parseInt(envMax, 10);
  return isNaN(parsed) ? DEFAULT_MAX_AUDIO_BYTES : parsed;
}

/**
 * Validate an audio URL against the allowed hosts.
 * Throws an error if the URL is invalid or not allowed.
 */
export function validateAudioUrl(
  rawUrl: string,
  allowedHosts: string[],
): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL format");
  }

  // Must be HTTPS
  if (url.protocol !== "https:") {
    throw new Error("URL must use HTTPS");
  }

  // Must not have credentials
  if (url.username || url.password) {
    throw new Error("URL must not contain credentials");
  }

  // Host must be in allowed list (exact match)
  const hostname = url.hostname.toLowerCase();
  if (!allowedHosts.includes(hostname)) {
    throw new Error(`Host not allowed: ${hostname}`);
  }

  return url;
}

/**
 * Validate a redirect URL during fetch.
 */
export function validateRedirectUrl(
  redirectUrl: string,
  allowedHosts: string[],
): URL {
  return validateAudioUrl(redirectUrl, allowedHosts);
}

/**
 * Check if a content type is an audio type.
 */
export function isAudioContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return (
    lower.startsWith("audio/") ||
    lower === "application/octet-stream" ||
    lower === "binary/octet-stream"
  );
}
