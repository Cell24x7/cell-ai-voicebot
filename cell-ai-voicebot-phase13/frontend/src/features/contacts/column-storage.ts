/** Per-user column choice for the contacts table (this browser only). */
const storageKey = (userId: string) => `cav.contacts.columns.${userId}`;

/** Saved column choice (per user, this browser only). Missing / blocked storage → none. */
export const readColumns = (userId: string): string[] => {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

export const saveColumns = (userId: string, keys: string[]): void => {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(keys));
  } catch {
    // storage blocked (private mode) — the choice lasts for this page only
  }
};
