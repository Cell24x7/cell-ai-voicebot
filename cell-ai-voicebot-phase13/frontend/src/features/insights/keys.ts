/** Query keys (src/README.md convention). */
export const insightKeys = {
  call: (callId: string) => ['insights', 'call', callId] as const,
  settings: ['insights', 'settings'] as const,
  dispositions: ['insights', 'dispositions'] as const,
  chat: (conversationId: string) => ['insights', 'chat', conversationId] as const,
};
