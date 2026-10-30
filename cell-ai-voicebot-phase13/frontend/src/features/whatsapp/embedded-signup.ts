import { useCallback } from 'react';

import type { WhatsAppConfig, WhatsAppMode } from '@/services/api/types';

import {
  loadMetaSdk,
  parseSessionMessage,
  SESSION_INFO_WAIT_MS,
  type FbLoginResponse,
  type SessionMessage,
} from './meta-sdk';

export interface SessionInfo {
  wabaId?: string;
  phoneNumberId?: string;
  waacId?: string;
}

export type SignupOutcome =
  | { kind: 'finished'; code: string; sessionInfo: SessionInfo }
  | { kind: 'cancelled'; step: string | null }
  | { kind: 'error'; message: string }
  | { kind: 'popup_blocked' }
  | { kind: 'sdk_failed'; message: string };

/** A login answer this fast without a code means the popup never opened. */
const POPUP_BLOCKED_MS = 800;

/**
 * `FB.login` options per mode — Embedded Signup v4 (Phase 13): the products come from
 * the Login for Business configuration, Cloud API `extras` stays empty and
 * session info is always sent (no `sessionInfoVersion`); coexistence still names the
 * Business app onboarding feature.
 */
export const loginOptions = (configId: string, mode: WhatsAppMode): Record<string, unknown> => ({
  config_id: configId,
  response_type: 'code',
  override_default_response_type: true,
  extras: mode === 'coexistence' ? { featureType: 'whatsapp_business_app_onboarding' } : {},
});

const sessionInfoOf = (msg: SessionMessage | null): SessionInfo =>
  msg?.kind === 'finish'
    ? {
        ...(msg.wabaId ? { wabaId: msg.wabaId } : {}),
        ...(msg.phoneNumberId ? { phoneNumberId: msg.phoneNumberId } : {}),
        ...(msg.waacId ? { waacId: msg.waacId } : {}),
      }
    : {};

/**
 * Runs Meta's Embedded Signup with the real SDK: listens for `WA_EMBEDDED_SIGNUP`,
 * calls `FB.login` and resolves with the code (sent to the backend at once — Meta
 * codes expire in ~30 s) plus the session ids when they arrive within 3 s.
 */
export const runEmbeddedSignup = async (
  config: Pick<WhatsAppConfig, 'appId' | 'configId' | 'graphVersion'>,
  mode: WhatsAppMode,
  { sessionWaitMs = SESSION_INFO_WAIT_MS, now = () => Date.now() } = {},
): Promise<SignupOutcome> => {
  let sdk;
  try {
    sdk = await loadMetaSdk({ appId: config.appId ?? '', version: config.graphVersion });
  } catch (err) {
    return { kind: 'sdk_failed', message: (err as Error).message };
  }
  let session: SessionMessage | null = null;
  let onSession: (() => void) | null = null;
  const listener = (event: MessageEvent) => {
    const parsed = parseSessionMessage(event);
    if (!parsed) return;
    session = parsed;
    onSession?.();
  };
  window.addEventListener('message', listener);
  const started = now();
  try {
    const response = await new Promise<FbLoginResponse>((resolve) => {
      sdk.login(resolve, loginOptions(config.configId ?? '', mode));
    });
    const code = response.authResponse?.code;
    if (code) {
      if (!session) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, sessionWaitMs);
          onSession = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
      return { kind: 'finished', code, sessionInfo: sessionInfoOf(session) };
    }
    const msg = session as SessionMessage | null;
    if (msg?.kind === 'error') return { kind: 'error', message: msg.message };
    if (msg?.kind === 'cancel') return { kind: 'cancelled', step: msg.step };
    if (now() - started < POPUP_BLOCKED_MS) return { kind: 'popup_blocked' };
    return { kind: 'cancelled', step: null };
  } finally {
    window.removeEventListener('message', listener);
  }
};

/** Hook form: `launch(mode)` → outcome (real Meta provider only). */
export const useEmbeddedSignup = (config: WhatsAppConfig | undefined) =>
  useCallback(
    (mode: WhatsAppMode) =>
      config
        ? runEmbeddedSignup(config, mode)
        : Promise.resolve<SignupOutcome>({
            kind: 'sdk_failed',
            message: 'WhatsApp setup is still loading.',
          }),
    [config],
  );
