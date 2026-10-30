/** Unsent text per conversation (memory only: switching chats keeps it, a reload does not). */
const drafts = new Map<string, string>();

export const readDraft = (conversationId: string): string => drafts.get(conversationId) ?? '';

export const saveDraft = (conversationId: string, text: string): void => {
  if (text) drafts.set(conversationId, text);
  else drafts.delete(conversationId);
};
