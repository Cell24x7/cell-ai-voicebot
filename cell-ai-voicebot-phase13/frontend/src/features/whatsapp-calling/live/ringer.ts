/** Ring sound + browser notification for incoming WhatsApp calls (no files, no network). */

const MUTE_KEY = 'cav.ring.muted';
const ASKED_KEY = 'cav.ring.notifyAsked';

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const isRingMuted = (): boolean => storage()?.getItem(MUTE_KEY) === '1';
export const setRingMuted = (muted: boolean): void => {
  try {
    if (muted) storage()?.setItem(MUTE_KEY, '1');
    else storage()?.removeItem(MUTE_KEY);
  } catch {
    // private mode: the choice lasts for this page only
  }
};

type Ctx = { close: () => Promise<void> } & Pick<
  AudioContext,
  'createOscillator' | 'createGain' | 'currentTime' | 'destination'
>;

/** A two-tone ring every 2 s until stopped. Returns the stop function. */
export const startRing = (make: () => Ctx | null = defaultContext): (() => void) => {
  const ctx = make();
  if (!ctx) return () => undefined;
  let stopped = false;
  const beep = () => {
    if (stopped) return;
    for (const [hz, at] of [
      [440, 0],
      [480, 0.4],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = hz;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.35);
    }
  };
  beep();
  const timer = setInterval(beep, 2_000);
  return () => {
    stopped = true;
    clearInterval(timer);
    void ctx.close().catch(() => undefined);
  };
};

const defaultContext = (): Ctx | null => {
  try {
    return typeof AudioContext === 'undefined' ? null : new AudioContext();
  } catch {
    return null;
  }
};

/** Asks for notification permission once per browser (never again after an answer). */
export const askNotificationsOnce = (): void => {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  if (storage()?.getItem(ASKED_KEY)) return;
  try {
    storage()?.setItem(ASKED_KEY, '1');
  } catch {
    // ignore
  }
  void Notification.requestPermission().catch(() => undefined);
};

/** A system notification while the tab is in the background. Text: the label only. */
export const notifyIncoming = (label: string): (() => void) => {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted')
    return () => undefined;
  if (typeof document !== 'undefined' && !document.hidden) return () => undefined;
  try {
    const n = new Notification('Incoming WhatsApp call', { body: label, tag: 'wa-call' });
    n.onclick = () => window.focus();
    return () => n.close();
  } catch {
    return () => undefined;
  }
};
