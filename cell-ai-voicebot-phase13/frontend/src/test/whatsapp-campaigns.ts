import type {
  WhatsAppCampaign,
  WhatsAppCampaignEstimate,
  WhatsAppCampaignReport,
} from '@/services/api/types';

export const fakeWaCampaign = (overrides: Partial<WhatsAppCampaign> = {}): WhatsAppCampaign => ({
  id: 'wc1',
  name: 'November reminders',
  channelId: 'wa1',
  status: 'draft',
  pauseReason: null,
  variants: [{ key: 'A', templateId: 'tpl1', splitPct: 100 }],
  abWinner: null,
  variables: {},
  audience: { listIds: ['l1'], segmentId: null, tags: null, contactIds: [], csvUploadId: null },
  excludeRecentDays: 0,
  schedule: { kind: 'now', at: null, timezone: 'Asia/Kolkata', recurrence: null },
  headerMedia: null,
  parentCampaignId: null,
  recurrenceEnabled: true,
  counters: {
    total: 50,
    queued: 50,
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    failedTotal: 0,
    skippedTotal: 0,
    skipped: {},
    failed: {},
  },
  cost: { estimateMicros: 5_000_000, chargedMicros: 0 },
  nextBatchAt: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-11-04T10:00:00.000Z',
  updatedAt: '2026-11-04T10:00:00.000Z',
  ...overrides,
});

export const fakeWaEstimate = (
  overrides: Partial<WhatsAppCampaignEstimate> = {},
): WhatsAppCampaignEstimate => ({
  recipients: 50,
  skipped: {},
  shortfallMicros: 0,
  byMarket: [{ market: 'IN', category: 'utility', count: 50, priceMicros: 100_000 }],
  totalMicros: 5_000_000,
  walletAvailableMicros: 10_000_000,
  enough: true,
  note: 'Upper bound; ineligible contacts are skipped at start.',
  ...overrides,
});

export const fakeWaReport = (): WhatsAppCampaignReport => ({
  funnel: { total: 50, sent: 45, delivered: 40, read: 30, replied: 10, failed: 2, skipped: 3 },
  cost: { estimateMicros: 5_000_000, chargedMicros: 4_000_000 },
  skippedByReason: { dnd: 3 },
  failedByCode: { '130429': 2 },
  perDay: [],
  variants: [{ key: 'A', sent: 45, read: 30, replied: 10 }],
  winner: 'A',
});
