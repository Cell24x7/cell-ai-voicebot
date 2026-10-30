/** Text helpers for the agent editor fields. */

/** `value` with `{{token}}` inserted at the selection of `el` (or at the end). */
export const insertAtCaret = (
  value: string,
  token: string,
  el: HTMLInputElement | HTMLTextAreaElement | null,
): { value: string; caret: number } => {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? start;
  const text = `{{${token}}}`;
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
};

/** `null` when `text` is empty or a JSON object / array, else the parser's message. */
export const jsonTemplateError = (text: string): string | null => {
  if (!text.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? null : 'Use a JSON object or array';
  } catch (err) {
    return `Not valid JSON: ${err instanceof Error ? err.message : 'parse error'}`;
  }
};
