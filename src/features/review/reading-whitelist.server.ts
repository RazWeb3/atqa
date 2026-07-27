import { promises as fs } from "node:fs";
import path from "node:path";
import type { WhitelistEntry } from "./reading-whitelist";

// The whitelist lives in a repo-tracked JSON file so approvals survive
// restarts and can be versioned/shared through git. Kept outside src/ to
// avoid triggering dev-server recompiles on every write.
function getWhitelistPath(): string {
  return (
    process.env.WHITELIST_PATH ||
    path.join(process.cwd(), "data", "reading-whitelist.json")
  );
}

type WhitelistFile = {
  version: number;
  entries: WhitelistEntry[];
};

function isValidEntry(value: unknown): value is WhitelistEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.token === "string" &&
    entry.token.length > 0 &&
    typeof entry.reading === "string" &&
    entry.reading.length > 0
  );
}

export async function loadWhitelist(): Promise<WhitelistEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(getWhitelistPath(), "utf8");
  } catch {
    // A missing file simply means nothing has been approved yet.
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as WhitelistFile;
    if (!Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter(isValidEntry);
  } catch {
    return [];
  }
}

async function saveWhitelist(entries: WhitelistEntry[]): Promise<void> {
  const filePath = getWhitelistPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const sorted = [...entries].sort((a, b) =>
    a.token.localeCompare(b.token, "ja"),
  );
  const file: WhitelistFile = { version: 1, entries: sorted };
  await fs.writeFile(filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

/**
 * Add or replace the approved reading for a token.
 * Returns the updated, sorted whitelist.
 */
export async function addWhitelistEntry(
  token: string,
  reading: string,
): Promise<WhitelistEntry[]> {
  const entries = await loadWhitelist();
  const next = entries.filter((entry) => entry.token !== token);
  next.push({ token, reading, addedAt: new Date().toISOString() });
  await saveWhitelist(next);
  return loadWhitelist();
}

/**
 * Remove the entry for a token. Returns the updated whitelist.
 */
export async function removeWhitelistEntry(
  token: string,
): Promise<WhitelistEntry[]> {
  const entries = await loadWhitelist();
  const next = entries.filter((entry) => entry.token !== token);
  await saveWhitelist(next);
  return loadWhitelist();
}
