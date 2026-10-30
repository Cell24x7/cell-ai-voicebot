import { useEffect, useState, useSyncExternalStore } from 'react';

import { useAuthStore } from '@/features/auth/store';

/** Dates in the inbox follow the account timezone (ADR 0017). */
export const useAccountTimezone = (): string =>
  useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');

/** The current time, re-read every `intervalMs` (window countdown, list times). */
export const useNow = (intervalMs = 60_000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
};

const subscribeOnline = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
};

/** `navigator.onLine`, live (sending is disabled while offline). */
export const useOnline = (): boolean =>
  useSyncExternalStore(subscribeOnline, () => navigator.onLine);
