/** React Query keys of the Integrations page (Phase 15). */
export const integrationKeys = {
  webhooks: ['integrations', 'webhooks'] as const,
  devReceiver: ['integrations', 'dev-receiver'] as const,
  deliveries: (id: string, filters: Record<string, unknown>) =>
    ['integrations', 'webhooks', id, 'deliveries', filters] as const,
  rules: ['integrations', 'outcome-rules'] as const,
  sheets: ['integrations', 'sheet-imports'] as const,
  afterCall: (callId: string) => ['calls', callId, 'after-call'] as const,
};
