/** Query keys (src/README.md convention). */
export const callingKeys = {
  all: ['whatsapp-calling'] as const,
  live: (callId: string) => ['whatsapp-calling', 'live', callId] as const,
  settings: (channelId: string) => ['whatsapp-calling', 'settings', channelId] as const,
  permissions: ['whatsapp-calling', 'permission'] as const,
  permission: (channelId: string, contactId: string) =>
    ['whatsapp-calling', 'permission', channelId, contactId] as const,
};
