const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

export interface ParsedLeads {
  emails: string[];
  duplicates: number;
}

/**
 * Pulls every email address out of a CSV or plain-text file, whatever its columns or header
 * row look like. Addresses are lower-cased and de-duplicated, keeping first-seen order.
 */
export function parseLeads(text: string): ParsedLeads {
  const found = text.match(EMAIL_PATTERN) ?? [];
  const seen = new Set<string>();
  for (const raw of found) seen.add(raw.toLowerCase());
  return { emails: [...seen], duplicates: found.length - seen.size };
}

export function isEmail(value: string) {
  return new RegExp(`^${EMAIL_PATTERN.source}$`, "i").test(value.trim());
}
