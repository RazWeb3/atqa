import { z } from "zod";

// A human-approved reading for a token that the AI flagged. Entries act as
// an overlay on the pronunciation dictionary, so one approval applies to
// every unit and every content file from the next review onwards.
export type WhitelistEntry = {
  token: string;
  reading: string;
  addedAt: string;
};

export const WhitelistAddSchema = z.object({
  token: z.string().trim().min(1).max(100),
  reading: z.string().trim().min(1).max(200),
});

export const WhitelistRemoveSchema = z.object({
  token: z.string().trim().min(1).max(100),
});
