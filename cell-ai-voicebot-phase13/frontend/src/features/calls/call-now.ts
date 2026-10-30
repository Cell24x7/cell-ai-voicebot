import { formatInZone } from '@/features/campaigns/time';
import { getErrorMessage, toApiError } from '@/services/api/errors';

/** Why the server refused, in words (the window detail carries when calls may resume). */
export const callNowErrorText = (err: unknown, timezone: string): string => {
  const e = toApiError(err);
  const detail = e.details[0]?.message;
  if (e.code === 'CALL_OUTSIDE_WINDOW' && detail) {
    return `${e.message} Calls are allowed again ${formatInZone(detail, timezone)}.`;
  }
  return detail && e.code === 'CALL_NOT_ALLOWED' ? `${e.message} ${detail}.` : getErrorMessage(err);
};
