/** A small built-in emoji set (no library — keeps the chunk tiny). */
export const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: [
      '😀',
      '😃',
      '😄',
      '😁',
      '😊',
      '🙂',
      '😉',
      '😍',
      '😘',
      '😎',
      '🤔',
      '😐',
      '😅',
      '😂',
      '🤣',
      '😢',
      '😭',
      '😡',
      '😴',
      '🤗',
    ],
  },
  { label: 'Gestures', emojis: ['👍', '👎', '👌', '🙏', '👏', '🙌', '💪', '🤝', '✌️', '👋'] },
  { label: 'Symbols', emojis: ['❤️', '💯', '✅', '❌', '⚠️', '⭐', '🔥', '🎉', '💰', '📞'] },
  { label: 'Objects', emojis: ['📄', '📎', '📅', '⏰', '🏠', '🚗', '💳', '🏦', '📱', '✉️'] },
];

/** One-tap reactions on a message. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const RECENT_KEY = 'cav.inbox.recentEmojis';
const RECENT_MAX = 16;

/** Recently used emojis (this browser only); blocked storage → none. */
export const readRecentEmojis = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    return [];
  }
};

/** Moves `emoji` to the front of the recent list and returns the new list. */
export const pushRecentEmoji = (emoji: string): string[] => {
  const next = [emoji, ...readRecentEmojis().filter((e) => e !== emoji)].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage blocked: the list lasts for this page only
  }
  return next;
};
