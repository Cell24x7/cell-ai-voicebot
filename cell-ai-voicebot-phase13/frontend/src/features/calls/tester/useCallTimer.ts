import { useEffect, useState } from 'react';

/** Seconds since `answeredAt`, ticking once a second while the call runs. */
export function useCallTimer(answeredAt: number | null, running: boolean, now = () => Date.now()) {
  const [tick, setTick] = useState(() => now());
  useEffect(() => {
    if (!running || answeredAt === null) return undefined;
    const id = setInterval(() => setTick(now()), 1000);
    return () => clearInterval(id);
  }, [running, answeredAt, now]);
  return answeredAt === null ? 0 : Math.max(0, Math.floor((tick - answeredAt) / 1000));
}
