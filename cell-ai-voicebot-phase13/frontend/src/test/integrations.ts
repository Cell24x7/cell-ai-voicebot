import type {
  ApiKey,
  ApiRequestLog,
  OutcomeRule,
  SheetImport,
  SheetPreview,
  WebhookDelivery,
  WebhookEndpoint,
} from '@/services/api/types';

const AT = '2026-10-30T05:00:00.000Z';

export const fakeEndpoint = (o: Partial<WebhookEndpoint> = {}): WebhookEndpoint => ({
  id: 'we1',
  url: 'https://crm.example.com/hooks/notifynow',
  description: 'CRM',
  events: ['*'],
  includePersonalData: false,
  active: true,
  disabledReason: null,
  disabledAt: null,
  failureStreak: 0,
  lastDeliveryAt: AT,
  lastDeliveryStatus: 'succeeded',
  rotatedAt: null,
  createdAt: AT,
  ...o,
});

export const fakeDelivery = (o: Partial<WebhookDelivery> = {}): WebhookDelivery => ({
  id: 'wd1',
  endpointId: 'we1',
  eventId: 'evt_01JB0000000000000000000000',
  type: 'call.completed',
  test: false,
  status: 'failed',
  attempt: 2,
  nextAttemptAt: null,
  lastAttemptAt: AT,
  responseStatus: 500,
  responseMs: 120,
  responseSnippet: '<b>oops</b>',
  error: null,
  attempts: [
    { attempt: 1, at: AT, ok: false, responseStatus: 500, responseMs: 110, error: null },
    { attempt: 2, at: AT, ok: false, responseStatus: null, responseMs: 10000, error: 'timeout' },
  ],
  createdAt: AT,
  ...o,
});

export const fakeRule = (o: Partial<OutcomeRule> = {}): OutcomeRule => ({
  id: 'r1',
  name: 'Payment link after a promise',
  active: true,
  order: 0,
  when: {
    dispositions: ['promise_to_pay'],
    sentiment: [],
    hasPromise: true,
    notAnsweredInARow: null,
    callKinds: [],
    flowIds: [],
    campaignIds: [],
  },
  send: {
    channelId: null,
    templateId: 'tpl1',
    template: { name: 'emi_reminder', language: 'en', status: 'APPROVED' },
    params: [{ from: 'contact', key: 'name', value: null }],
  },
  timing: { mode: 'now', delayMinutes: null },
  createdAt: AT,
  ...o,
});

export const fakeSheet = (o: Partial<SheetImport> = {}): SheetImport => ({
  id: 's1',
  name: 'Leads sheet',
  schedule: 'daily',
  mapping: { columns: [] },
  listId: 'l1',
  listName: 'Sheet: Leads sheet',
  updateExisting: true,
  tags: [],
  active: true,
  nextRunAt: '2026-10-31T05:00:00.000Z',
  lastRunAt: AT,
  lastStatus: 'ok',
  lastError: null,
  lastResult: { importJobId: 'j1', rows: 12, created: 10, updated: 1, failed: 1 },
  createdAt: AT,
  ...o,
});

export const fakeSheetPreview = (o: Partial<SheetPreview> = {}): SheetPreview => ({
  columns: [
    { index: 0, header: 'Name', samples: ['Asha', 'Ravi'] },
    { index: 1, header: 'Mobile', samples: ['9876543210'] },
    { index: 2, header: 'City', samples: ['Pune'] },
  ],
  rowCount: 2,
  suggestedMapping: [
    { index: 0, target: 'name' },
    { index: 1, target: 'phone' },
    { index: 2, target: 'field', key: 'city' },
  ],
  ...o,
});

export const fakeApiKey = (o: Partial<ApiKey> = {}): ApiKey => ({
  id: 'k1',
  name: 'CRM sync',
  prefix: 'cav_live_ab12',
  scopes: ['calls:read'],
  lastUsedAt: null,
  revokedAt: null,
  createdBy: 'u1',
  createdAt: AT,
  ipAllowlist: [],
  expiresAt: null,
  requests24h: 0,
  requests7d: 0,
  ...o,
});

export const fakeRequestLog = (o: Partial<ApiRequestLog> = {}): ApiRequestLog => ({
  id: 'q1',
  method: 'GET',
  route: '/api/v1/calls/:id',
  status: 200,
  ms: 42,
  requestId: 'req-1',
  at: AT,
  ...o,
});
