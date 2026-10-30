/** Backend INBOX_LIMITS (optOutKeywordsMax / keywordMaxLength / replyTextMax). */
export const KEYWORDS_MAX = 30;
export const KEYWORD_MAX_LENGTH = 30;
export const REPLY_TEXT_MAX = 1024;

/** Same as the server: trimmed, single spaces, upper-case (Hindi is unchanged). */
export const normalizeKeyword = (raw: string): string =>
  raw.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();

/** Adds a keyword to `list` unless it is empty, too long, already there or in the other list. */
export const addKeyword = (
  list: string[],
  other: string[],
  raw: string,
): { keywords: string[]; error: string | null } => {
  const k = normalizeKeyword(raw);
  const fail = (error: string) => ({ keywords: list, error });
  if (!k) return fail('Type a keyword');
  if (k.length > KEYWORD_MAX_LENGTH)
    return fail(`At most ${String(KEYWORD_MAX_LENGTH)} characters`);
  if (list.includes(k)) return fail('Already in this list');
  if (other.includes(k)) return fail('Already in the other list');
  if (list.length >= KEYWORDS_MAX) return fail(`At most ${String(KEYWORDS_MAX)} keywords`);
  return { keywords: [...list, k], error: null };
};

/** "Messages are kept for 90 days" (0 = no automatic deletion). */
export const retentionText = (days: number): string =>
  days === 0
    ? 'Messages are kept until the account is deleted.'
    : `Messages are kept for ${String(days)} days, then deleted automatically.`;
