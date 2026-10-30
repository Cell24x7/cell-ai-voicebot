/**
 * ICU (Chrome, Node) still reports some zones by their legacy IANA names —
 * India is `Asia/Calcutta`. We store and show the current names.
 */
const CURRENT_NAMES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'America/Godthab': 'America/Nuuk',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
};

export const currentTimezoneName = (zone: string): string => CURRENT_NAMES[zone] ?? zone;

/** The browser's zone (current name), `Asia/Kolkata` if unknown. */
export const browserTimezone = (): string => {
  try {
    return currentTimezoneName(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
  } catch {
    return 'Asia/Kolkata';
  }
};

/** Every zone the browser knows, by current name, sorted. */
export const timezoneOptions = (): string[] => {
  try {
    return [...new Set(Intl.supportedValuesOf('timeZone').map(currentTimezoneName))].sort();
  } catch {
    return ['Asia/Kolkata', 'UTC'];
  }
};
