import type { LedgerEntry } from '@/services/api/types';
import type { LedgerType } from '@/services/api/wallet';
import { formatCurrencyMicros } from '@/utils/format';

/** Same words as the API's descriptions. */
export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  topup: 'Wallet recharge',
  call_charge: 'Call charge',
  ai_charge: 'AI usage',
  tts_charge: 'Voice (TTS) usage',
  adjustment: 'Adjustment',
  refund: 'Refund',
  subscription: 'Subscription',
  recording_charge: 'Recording storage',
  whatsapp_charge: 'WhatsApp message',
  whatsapp_call_charge: 'WhatsApp call',
};

export const LEDGER_STATUS_LABELS: Record<LedgerEntry['status'], string> = {
  held: 'On hold',
  captured: 'Done',
  released: 'Released',
};

/** `+₹1,000.00` for credits, `−₹2.00` for debits (true minus sign). */
export const signedAmount = (e: Pick<LedgerEntry, 'direction' | 'amountMicros'>): string =>
  `${e.direction === 'credit' ? '+' : '−'}${formatCurrencyMicros(e.amountMicros)}`;

/** `1 min 30 s` / `45 s`. */
export const formatSeconds = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (!m) return `${s} s`;
  return s ? `${m} min ${s} s` : `${m} min`;
};

const WA_CATEGORY: Record<string, string> = {
  marketing: 'Marketing',
  utility: 'Utility',
  authentication: 'Authentication',
  authentication_international: 'Authentication',
  service: 'Service',
};
const SPECIAL_MARKETS: Record<string, string> = {
  NORTH_AMERICA: 'North America',
  OTHER: 'Other countries',
};
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** Meta's market code → a name (`IN` → India, `NORTH_AMERICA`, `OTHER`). */
export const marketName = (code: string): string => {
  const special = SPECIAL_MARKETS[code];
  if (special) return special;
  if (!/^[A-Z]{2}$/.test(code)) return code;
  return regionNames.of(code) ?? code;
};

/** Row text: "WhatsApp · Utility · India" for WhatsApp charges, else the API's description. */
export const ledgerDescription = (e: Pick<LedgerEntry, 'type' | 'description' | 'breakdown'>) => {
  const b = e.breakdown;
  // Phase 12: "WhatsApp call · India · 2:14" (the talk time charged)
  if (e.type === 'whatsapp_call_charge') {
    const sec = b?.durationSec;
    return [
      'WhatsApp call',
      ...(b?.waMarket ? [marketName(b.waMarket)] : []),
      ...(typeof sec === 'number'
        ? [`${String(Math.floor(sec / 60))}:${String(sec % 60).padStart(2, '0')}`]
        : []),
    ].join(' · ');
  }
  if (e.type !== 'whatsapp_charge' || !b?.waCategory) return e.description;
  const category = WA_CATEGORY[b.waCategory] ?? b.waCategory;
  return ['WhatsApp', category, ...(b.waMarket ? [marketName(b.waMarket)] : [])].join(' · ');
};

const PRICING_TYPES: Record<string, string> = {
  regular: 'Charged message',
  free_customer_service: 'Free (customer service window)',
  free_entry_point: 'Free (entry point)',
};
export const pricingTypeLabel = (type: string): string => PRICING_TYPES[type] ?? type;
