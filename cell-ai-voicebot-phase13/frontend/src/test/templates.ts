import { extractVariables } from '@/features/templates/variables';
import type {
  WhatsAppMarginRow,
  WhatsAppPricePreview,
  WhatsAppRateCard,
  WhatsAppRateCardMarket,
  WhatsAppReconcileRow,
  WhatsAppTemplate,
  WhatsAppTemplateCategory,
  WhatsAppTemplateComponent,
  WhatsAppTemplateListItem,
  WhatsAppTemplateStatus,
} from '@/services/api/types';

const AT = '2026-10-20T10:00:00.000Z';

/** A utility reminder: text header with a variable, body with 2 variables, footer, buttons. */
export const EMI_COMPONENTS: WhatsAppTemplateComponent[] = [
  { type: 'HEADER', format: 'TEXT', text: 'EMI for {{1}}', example: { header_text: ['Asha'] } },
  {
    type: 'BODY',
    text: 'Namaste {{1}}, your EMI of {{2}} is due soon. Please pay on time.',
    example: { body_text: [['Asha', '₹12,500.00']] },
  },
  { type: 'FOOTER', text: 'Demo Finance' },
  {
    type: 'BUTTONS',
    buttons: [
      { type: 'QUICK_REPLY', text: 'Paid already' },
      {
        type: 'URL',
        text: 'Pay now',
        url: 'https://pay.example.com/{{1}}',
        example: ['https://pay.example.com/LN-1001'],
      },
    ],
  },
];

export const fakeTemplateListItem = (
  status: WhatsAppTemplateStatus = 'APPROVED',
  category: WhatsAppTemplateCategory = 'UTILITY',
  overrides: Partial<WhatsAppTemplateListItem> = {},
): WhatsAppTemplateListItem => ({
  id: 'tpl1',
  name: 'emi_reminder',
  language: 'en',
  category,
  previousCategory: null,
  status,
  statusReason: null,
  quality: status === 'APPROVED' ? 'GREEN' : null,
  pausedUntil: null,
  purpose: 'general',
  editable: true,
  parameterFormat: 'positional',
  channelIds: ['wa1'],
  variablesCount: 4,
  submitted: status !== 'DRAFT',
  usage: { sent: 12, delivered: 10, read: 7, failed: 1, lastSentAt: AT },
  syncedAt: AT,
  createdAt: AT,
  updatedAt: AT,
  ...overrides,
});

/** A full template; variables follow the components (default source `ask`). */
export const fakeTemplate = (
  status: WhatsAppTemplateStatus = 'APPROVED',
  category: WhatsAppTemplateCategory = 'UTILITY',
  components: WhatsAppTemplateComponent[] = EMI_COMPONENTS,
  overrides: Partial<WhatsAppTemplate> = {},
): WhatsAppTemplate => {
  const format = overrides.parameterFormat ?? 'positional';
  const variables = extractVariables(components, format).map((v) => ({
    ...v,
    defaultSource: { kind: 'ask' as const, value: null },
  }));
  return {
    ...fakeTemplateListItem(status, category, { variablesCount: variables.length }),
    subCategory: null,
    components,
    variables,
    statusHistory: [
      { status: 'DRAFT', reason: null, at: AT, source: 'user' },
      ...(status === 'DRAFT' ? [] : [{ status, reason: null, at: AT, source: 'webhook' as const }]),
    ],
    ttlSeconds: null,
    headerMedia: null,
    editsLast30Days: 0,
    nextEditAt: null,
    deletedAt: null,
    createdBy: 'u1',
    ...overrides,
  };
};

export const fakePricePreview = (
  overrides: Partial<WhatsAppPricePreview> = {},
): WhatsAppPricePreview => ({
  payer: 'platform',
  market: 'IN',
  marketLabel: 'India',
  category: 'utility',
  priceMicros: 140_000,
  currency: 'INR',
  note: 'billed_when_delivered',
  ...overrides,
});

export const fakeRateMarket = (
  overrides: Partial<WhatsAppRateCardMarket> = {},
): WhatsAppRateCardMarket => ({
  market: 'IN',
  label: 'India',
  callingCodes: ['91'],
  marketingMicros: 863_100,
  utilityMicros: 115_000,
  authenticationMicros: 115_000,
  authenticationInternationalMicros: null,
  serviceMicros: 115_000,
  utilityTiers: [],
  authenticationTiers: [],
  ...overrides,
});

export const fakeRateCard = (overrides: Partial<WhatsAppRateCard> = {}): WhatsAppRateCard => ({
  id: 'rc1',
  effectiveFrom: '2026-10-01T00:00:00.000Z',
  currency: 'INR',
  source: 'manual',
  note: 'Placeholder rates',
  createdAt: '2026-10-01T00:00:00.000Z',
  kind: 'messaging',
  callingMarkets: [],
  markets: [
    fakeRateMarket(),
    fakeRateMarket({ market: 'OTHER', label: 'Other', callingCodes: [] }),
  ],
  ...overrides,
});

export const fakeMarginRow = (overrides: Partial<WhatsAppMarginRow> = {}): WhatsAppMarginRow => ({
  accountId: 'a1',
  accountName: 'Demo Finance',
  kind: 'message',
  category: 'utility',
  messages: 10,
  billedMicros: 1_400_000,
  metaCostMicros: 1_150_000,
  metaCostSource: 'list',
  marginMicros: 250_000,
  marginBps: 1786,
  mismatches: 0,
  ...overrides,
});

export const fakeReconcileRow = (
  overrides: Partial<WhatsAppReconcileRow> = {},
): WhatsAppReconcileRow => ({
  accountId: 'a1',
  wabaId: 'waba1',
  day: '2026-10-20',
  category: 'utility',
  metaVolume: 10,
  metaCostMicros: 1_150_000,
  ourCaptured: 10,
  ourBilledMicros: 1_400_000,
  diffVolume: 0,
  diffMicros: 0,
  fetchedAt: AT,
  ...overrides,
});
