/** Query keys (src/README.md convention). */
export const whatsappKeys = {
  all: ['whatsapp'] as const,
  config: ['whatsapp', 'config'] as const,
  channels: ['whatsapp', 'channels'] as const,
  channel: (id: string) => ['whatsapp', 'channel', id] as const,
  profile: (id: string) => ['whatsapp', 'profile', id] as const,
  adminStatus: ['whatsapp', 'admin', 'status'] as const,
  adminEvents: (status?: string) => ['whatsapp', 'admin', 'events', status ?? 'all'] as const,
};
