/**
 * Meta JS SDK for Embedded Signup (PHASE_9_PLAN §1c). Loaded lazily, once, only
 * with the real provider — never in fake mode or tests.
 */
export const META_SDK_URL = 'https://connect.facebook.net/en_US/sdk.js';
export const META_SDK_SCRIPT_ID = 'facebook-jssdk';
/** Give up loading the SDK after this long (blocked by an extension or the network). */
export const META_SDK_TIMEOUT_MS = 15_000;
/** How long to wait for the session info message after the code arrived. */
export const SESSION_INFO_WAIT_MS = 3_000;
/** Origins allowed to post `WA_EMBEDDED_SIGNUP` messages: https on facebook.com or a subdomain. */
export const isMetaOrigin = (origin: string): boolean => {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    !url.port &&
    (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'))
  );
};
export const SDK_FAILED_MESSAGE =
  "Couldn't load Meta's signup (blocked by an extension or network?)";

export interface FbLoginResponse {
  authResponse?: { code?: string | null } | null;
  status?: string;
}

export interface FacebookSdk {
  init(options: {
    appId: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
    version: string;
  }): void;
  login(callback: (response: FbLoginResponse) => void, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

let loading: Promise<FacebookSdk> | null = null;
let initialized = false;

/** Tests only. */
export const resetMetaSdk = (): void => {
  loading = null;
  initialized = false;
};

const init = (sdk: FacebookSdk, appId: string, version: string): FacebookSdk => {
  if (!initialized) {
    sdk.init({ appId, autoLogAppEvents: false, xfbml: true, version });
    initialized = true;
  }
  return sdk;
};

/** Loads (once) and initialises the SDK; rejects with `SDK_FAILED_MESSAGE` after the timeout. */
export const loadMetaSdk = ({
  appId,
  version,
  timeoutMs = META_SDK_TIMEOUT_MS,
}: {
  appId: string;
  version: string;
  timeoutMs?: number;
}): Promise<FacebookSdk> => {
  if (window.FB) return Promise.resolve(init(window.FB, appId, version));
  loading ??= new Promise<FacebookSdk>((resolve, reject) => {
    const fail = () => {
      clearTimeout(timer);
      loading = null;
      reject(new Error(SDK_FAILED_MESSAGE));
    };
    const timer = setTimeout(fail, timeoutMs);
    window.fbAsyncInit = () => {
      clearTimeout(timer);
      if (!window.FB) {
        fail();
        return;
      }
      resolve(init(window.FB, appId, version));
    };
    if (!document.getElementById(META_SDK_SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = META_SDK_SCRIPT_ID;
      script.src = META_SDK_URL;
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onerror = fail;
      document.body.appendChild(script);
    }
  });
  return loading;
};

export type SessionMessage =
  | { kind: 'finish'; wabaId?: string; phoneNumberId?: string; waacId?: string }
  | { kind: 'error'; message: string }
  | { kind: 'cancel'; step: string | null };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * `WA_EMBEDDED_SIGNUP` messages from Meta's popup (origin-checked, safe JSON; Embedded
 * Signup v4 sends no `version`). The documented finish events are accepted (`FINISH`,
 * `FINISH_ONLY_WABA`, `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`, `FINISH_OBO_MIGRATION`,
 * `FINISH_GRANT_ONLY_API_ACCESS`); `ERROR`, or `CANCEL` with an `error_message` (the
 * user reported an error), is an error; any other `CANCEL` is a cancel. `waba_id` names
 * Meta's Messaging account since 2026; `waac_id` (the WhatsApp account) is kept when sent.
 */
export const parseSessionMessage = (
  event: Pick<MessageEvent, 'origin' | 'data'>,
): SessionMessage | null => {
  if (!isMetaOrigin(event.origin)) return null;
  let payload: unknown = event.data;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;
  const msg = payload as { type?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (msg.type !== 'WA_EMBEDDED_SIGNUP') return null;
  const data = msg.data ?? {};
  const kind = typeof msg.event === 'string' ? msg.event : '';
  if (
    [
      'FINISH',
      'FINISH_ONLY_WABA',
      'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
      'FINISH_OBO_MIGRATION',
      'FINISH_GRANT_ONLY_API_ACCESS',
    ].includes(kind)
  ) {
    const wabaId = str(data.waba_id);
    const phoneNumberId = str(data.phone_number_id);
    const waacId = str(data.waac_id);
    return {
      kind: 'finish',
      ...(wabaId ? { wabaId } : {}),
      ...(phoneNumberId ? { phoneNumberId } : {}),
      ...(waacId ? { waacId } : {}),
    };
  }
  const reported = str(data.error_message);
  if (kind === 'ERROR' || (kind === 'CANCEL' && reported))
    return { kind: 'error', message: reported ?? 'Meta reported an error' };
  return kind === 'CANCEL' ? { kind: 'cancel', step: str(data.current_step) ?? null } : null;
};
