import type { EmailReportTab, ReportFrequency } from '@/services/api/report-subscriptions';

/** ≤ 5 report e-mails per person (server limit `REPORT_SUBSCRIPTION_LIMIT`). */
export const REPORT_EMAILS_MAX = 5;

export const FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  daily: 'Every day (yesterday)',
  weekly: 'Every Monday (last week)',
  monthly: 'On the 1st (last month)',
};

export const EMAIL_TABS: { key: EmailReportTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'calls', label: 'Calls' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'team', label: 'Team' },
];

/** `9` → `09:00`. */
export const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

export const tabsLabel = (tabs: EmailReportTab[]): string =>
  EMAIL_TABS.filter((t) => tabs.includes(t.key))
    .map((t) => t.label)
    .join(', ');

export interface ReportEmailDraft {
  frequency: ReportFrequency;
  tabs: EmailReportTab[];
  hour: number;
}

/** What is wrong with a draft, or `null`. */
export const draftProblem = (d: ReportEmailDraft): string | null => {
  if (!d.tabs.length) return 'Choose at least one section';
  if (!Number.isInteger(d.hour) || d.hour < 0 || d.hour > 23) return 'Choose an hour';
  return null;
};
