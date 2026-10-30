import { useEffect, useState } from 'react';

/**
 * `value`, but only after it stopped changing for `delayMs`.
 * Pass a primitive (e.g. `JSON.stringify(obj)`): a new object every render
 * restarts the timer forever.
 */
export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
};
