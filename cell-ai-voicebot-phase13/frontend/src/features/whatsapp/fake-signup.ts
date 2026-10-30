import type { WhatsAppMode } from '@/services/api/types';

import type { SessionInfo } from './embedded-signup';

export type FakeOutcome = 'finish' | 'only_waba' | 'cancel' | 'error';

export interface FakeSignupInput {
  businessName: string;
  phone: string;
  displayName: string;
  mode: WhatsAppMode;
  outcome: FakeOutcome;
}

const base64url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const nonce = (): string => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * The fake provider's signup code: `fake.<base64url JSON>` — the Test signup dialog's
 * fields (+ a nonce: like Meta's codes, every one is single use).
 */
export const buildFakeCode = (input: FakeSignupInput): string =>
  `fake.${base64url(JSON.stringify({ nonce: nonce(), ...input }))}`;

/** The ids Meta would report in its session message (same hash as the backend fake). */
export const fakeSessionInfo = async (input: FakeSignupInput): Promise<SessionInfo> => {
  const digits = input.phone.replace(/\D/g, '');
  const data = new TextEncoder().encode(`${input.businessName.trim()}|${digits}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const h = [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12);
  return input.outcome === 'only_waba'
    ? { wabaId: `fake_waba_${h}` }
    : { wabaId: `fake_waba_${h}`, phoneNumberId: `fake_phone_${h}` };
};
