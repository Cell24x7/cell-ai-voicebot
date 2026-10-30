import type { ReportQuery, ReportTab } from '@/services/api/reports';
import { shiftYmd } from '@/utils/datetime';

export const REPORT_TABS: { key: ReportTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'calls', label: 'Calls' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'templates', label: 'Templates' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'flows', label: 'Flows' },
  { key: 'agents', label: 'AI agents' },
  { key: 'team', label: 'Team' },
];

export const isReportTab = (v: string | undefined): v is ReportTab =>
  REPORT_TABS.some((t) => t.key === v);

export const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
] as const;
export type Preset = (typeof PRESETS)[number]['key'];

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-f0-9]{24}$/i;
export const MAX_DAYS = 366;

/** First day of the month of `ymd`. */
const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`;

/** The day range of a preset, `today` being the account-local today. */
export const presetRange = (preset: Exclude<Preset, 'custom'>, today: string) => {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: shiftYmd(today, -1), to: shiftYmd(today, -1) };
    case '7d':
      return { from: shiftYmd(today, -6), to: today };
    case '30d':
      return { from: shiftYmd(today, -29), to: today };
    case '90d':
      return { from: shiftYmd(today, -89), to: today };
    case 'month':
      return { from: monthStart(today), to: today };
    case 'last_month': {
      const end = shiftYmd(monthStart(today), -1);
      return { from: monthStart(end), to: end };
    }
  }
};

export const SLICES = [
  { key: 'campaignId', label: 'Campaign' },
  { key: 'flowId', label: 'Flow' },
  { key: 'agentId', label: 'AI agent' },
  { key: 'userId', label: 'Team member' },
  { key: 'channelId', label: 'WhatsApp number' },
] as const;
export type SliceKey = (typeof SLICES)[number]['key'];

export interface ReportFilters {
  preset: Preset;
  from: string;
  to: string;
  compare: boolean;
  channel: 'voice' | 'whatsapp' | null;
  slice: { key: SliceKey; id: string } | null;
  includeTest: boolean;
  campaignIds: string[];
}

/** Filters from the URL (unknown / bad values fall back to "last 7 days, everything"). */
export const filtersFromParams = (params: URLSearchParams, today: string): ReportFilters => {
  const preset = PRESETS.find((p) => p.key === params.get('range'))?.key ?? '7d';
  const customFrom = params.get('from') ?? '';
  const customTo = params.get('to') ?? '';
  const custom =
    preset === 'custom' && YMD.test(customFrom) && YMD.test(customTo)
      ? { from: customFrom, to: customTo }
      : null;
  const range = custom ?? presetRange(preset === 'custom' ? '7d' : preset, today);
  const sliceKey = SLICES.find((s) => ID.test(params.get(s.key) ?? ''))?.key;
  const channel = params.get('channel');
  return {
    preset: preset === 'custom' && !custom ? '7d' : preset,
    ...range,
    compare: params.get('compare') === '1',
    channel: channel === 'voice' || channel === 'whatsapp' ? channel : null,
    slice: sliceKey ? { key: sliceKey, id: params.get(sliceKey) ?? '' } : null,
    includeTest: params.get('test') === '1',
    campaignIds: (params.get('campaignIds') ?? '')
      .split(',')
      .filter((id) => ID.test(id))
      .slice(0, 10),
  };
};

export const filtersToParams = (f: ReportFilters): URLSearchParams => {
  const p = new URLSearchParams();
  if (f.preset !== '7d') p.set('range', f.preset);
  if (f.preset === 'custom') {
    p.set('from', f.from);
    p.set('to', f.to);
  }
  if (f.compare) p.set('compare', '1');
  if (f.channel) p.set('channel', f.channel);
  if (f.slice) p.set(f.slice.key, f.slice.id);
  if (f.includeTest) p.set('test', '1');
  if (f.campaignIds.length) p.set('campaignIds', f.campaignIds.join(','));
  return p;
};

export const toQuery = (f: ReportFilters, tab: ReportTab): ReportQuery => ({
  from: f.from,
  to: f.to,
  ...(f.compare ? { compare: true } : {}),
  ...(f.channel ? { channel: f.channel } : {}),
  ...(f.slice ? { [f.slice.key]: f.slice.id } : {}),
  ...(f.includeTest ? { includeTest: true } : {}),
  ...(tab === 'campaigns' && f.campaignIds.length ? { campaignIds: f.campaignIds } : {}),
});

/** Custom ranges: start ≤ end, at most 366 days. */
export const rangeProblem = (from: string, to: string): string | null => {
  if (!YMD.test(from) || !YMD.test(to)) return 'Choose both days';
  if (from > to) return 'The start must be before the end';
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  return days > MAX_DAYS ? `At most ${String(MAX_DAYS)} days` : null;
};
