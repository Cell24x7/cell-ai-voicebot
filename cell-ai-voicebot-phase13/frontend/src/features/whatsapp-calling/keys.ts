/** Query keys (src/README.md convention). */
export const callingKeys = {
  all: ['whatsapp-calling'] as const,
  price: (channelId: string, contactId: string) =>
    ['whatsapp-calling', 'price', channelId, contactId] as const,
  live: (callId: string) => ['whatsapp-calling', 'live', callId] as const,
  settings: (channelId: string) => ['whatsapp-calling', 'settings', channelId] as const,
  readiness: (channelId: string) => ['whatsapp-calling', 'readiness', channelId] as const,
  permissions: ['whatsapp-calling', 'permission'] as const,
  permissionRun: (runId: string) => ['whatsapp-calling', 'permission-run', runId] as const,
  permission: (channelId: string, contactId: string) =>
    ['whatsapp-calling', 'permission', channelId, contactId] as const,
};
