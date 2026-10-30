const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** `<prefix>_<8 random [a-z0-9]>` (node / edge ids); `prefix` empty → just the 8 chars (handle ids). */
export const newId = (prefix = ''): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const id = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return prefix ? `${prefix}_${id}` : id;
};
