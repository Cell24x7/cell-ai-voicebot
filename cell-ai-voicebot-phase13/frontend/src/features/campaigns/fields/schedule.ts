import type { CampaignSettingsInput } from '@/services/api/campaigns';

export type ScheduleValue = NonNullable<CampaignSettingsInput['schedule']>;
export type ScheduleMode = 'now' | 'later' | 'recurring';

export const scheduleMode = (value: ScheduleValue): ScheduleMode =>
  value.recurrence ? 'recurring' : value.startAt ? 'later' : 'now';

/** Problems to show before "Next" (empty = valid). */
export const scheduleProblems = (value: ScheduleValue, now = new Date()): string[] => {
  const problems: string[] = [];
  const mode = scheduleMode(value);
  if (mode === 'later' && value.startAt && new Date(value.startAt) <= now) {
    problems.push('The start must be in the future');
  }
  if (value.endAt) {
    const start = value.startAt ? new Date(value.startAt) : now;
    if (new Date(value.endAt) <= start) problems.push('The end must be after the start');
  }
  if (mode === 'recurring' && value.recurrence) {
    if (value.recurrence.freq === 'weekly' && value.recurrence.days.length === 0) {
      problems.push('Pick at least one day for a weekly campaign');
    }
    if (value.recurrence.until && new Date(value.recurrence.until) <= now) {
      problems.push('"Until" must be in the future');
    }
  }
  return problems;
};
