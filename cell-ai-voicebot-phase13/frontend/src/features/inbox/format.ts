import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export { formatBytes } from '@/utils/format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface WindowState {
  open: boolean;
  /** "3 h 12 m" / "45 m" / "< 1 m"; empty when closed. */
  remainingLabel: string;
  remainingMs: number;
}

/** 24-hour customer service window from its end time (`null` = never opened). */
export const windowState = (expiresAt: string | null, now: number = Date.now()): WindowState => {
  const end = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const remainingMs = Number.isNaN(end) ? 0 : Math.max(0, end - now);
  if (remainingMs <= 0) return { open: false, remainingLabel: '', remainingMs: 0 };
  const hours = Math.floor(remainingMs / HOUR);
  const minutes = Math.floor((remainingMs % HOUR) / MINUTE);
  const remainingLabel =
    hours > 0 ? `${hours} h ${minutes} m` : minutes > 0 ? `${minutes} m` : '< 1 m';
  return { open: true, remainingLabel, remainingMs };
};

/** Header chip text: "Open · 3 h 12 m left" / "Closed". */
export const windowLabel = (state: WindowState): string =>
  state.open ? `Open · ${state.remainingLabel} left` : 'Closed';

/** `+919000077001` → `+91 ••••• 7001` (never the full number). */
export const maskPhone = (e164: string): string => {
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 6) return '••••';
  const cc = parsePhoneNumberFromString(`+${digits}`)?.countryCallingCode;
  return `${cc ? `+${cc} ` : ''}••••• ${digits.slice(-4)}`;
};

/** Seconds → `0:42` / `12:05`. */
export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const ymd = (at: string | number, timezone: string) =>
  format(new TZDate(typeof at === 'string' ? Date.parse(at) : at, timezone), 'yyyy-MM-dd');

/** Date separator in the chat: "Today" / "Yesterday" / "22 Oct 2026" (account timezone). */
export const dayLabel = (iso: string, timezone: string, now: number = Date.now()): string => {
  const day = ymd(iso, timezone);
  if (day === ymd(now, timezone)) return 'Today';
  if (day === ymd(now - 24 * HOUR, timezone)) return 'Yesterday';
  return format(new TZDate(iso, timezone), 'dd MMM yyyy');
};

/** Bubble time "14:05" (account timezone). */
export const timeLabel = (iso: string, timezone: string): string =>
  format(new TZDate(iso, timezone), 'HH:mm');

/** List row time: "14:05" today, "Yesterday", else "22 Oct". */
export const listTimeLabel = (iso: string, timezone: string, now: number = Date.now()): string => {
  const day = dayLabel(iso, timezone, now);
  if (day === 'Today') return timeLabel(iso, timezone);
  if (day === 'Yesterday') return day;
  return format(new TZDate(iso, timezone), 'dd MMM');
};

/** Avatar initials: "Asha Verma" → "AV", a number → "#". */
export const initials = (label: string): string => {
  const words = label
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w.charAt(0)));
  if (!words.length) return '#';
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
};

/** Google Maps link built from coordinates only (never a link the customer sent). */
export const mapsUrl = (latitude: number, longitude: number): string =>
  `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;

export type TextSegment = { text: string; href?: undefined } | { text: string; href: string };

const LINK = /\bhttps?:\/\/[^\s<>"']+/gi;
const TRAILING = /[).,!?;:'"\]]+$/;

/** Splits message text into plain parts and http(s) links (nothing else becomes a link). */
export const linkify = (text: string): TextSegment[] => {
  const out: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const start = match.index;
    let url = match[0];
    const trailing = TRAILING.exec(url)?.[0] ?? '';
    url = url.slice(0, url.length - trailing.length);
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
};
