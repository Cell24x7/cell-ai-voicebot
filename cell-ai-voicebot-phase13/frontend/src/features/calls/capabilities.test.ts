import { describe, expect, it } from 'vitest';

import { fakeChannel } from '@/test/whatsapp';

import { callMethods, canReadCampaignType, whatsappCapabilities } from './capabilities';

describe('number capabilities', () => {
  const ready = () =>
    fakeChannel({ calling: { status: 'enabled', unavailableReason: null, restricted: false } });
  it('keeps messaging available when coexistence prevents calling', () => {
    expect(whatsappCapabilities({ ...ready(), mode: 'coexistence' })).toEqual({
      messaging: true,
      calling: false,
      reason: 'WhatsApp calls are unavailable on Business App numbers',
    });
    expect(whatsappCapabilities({ ...ready(), isOnBizApp: true }).calling).toBe(false);
  });
  it('rejects disconnected, disabled and restricted calls', () => {
    expect(whatsappCapabilities({ ...ready(), status: 'disconnected' }).messaging).toBe(false);
    expect(whatsappCapabilities(fakeChannel()).calling).toBe(false);
    expect(
      whatsappCapabilities({ ...ready(), calling: { ...ready().calling, restricted: true } })
        .calling,
    ).toBe(false);
    expect(whatsappCapabilities(ready()).calling).toBe(true);
  });
  it('shows no dial methods without permission and keeps sender identities distinct', () => {
    expect(callMethods({ canCall: false, channels: [ready()] })).toEqual({
      phone: false,
      whatsapp: [],
    });
    expect(
      callMethods({
        canCall: true,
        channels: [ready(), { ...ready(), id: 'wa2' }, fakeChannel()],
      }).whatsapp.map((n) => n.id),
    ).toEqual(['wa1', 'wa2']);
    expect(callMethods({ canCall: true, channels: [] })).toEqual({ phone: false, whatsapp: [] });
  });
  it('allows WhatsApp-only custom roles without granting phone campaign access', () => {
    const permissions = new Set(['whatsapp.campaigns.read']);
    expect(canReadCampaignType('whatsapp', permissions)).toBe(true);
    expect(canReadCampaignType('phone', permissions)).toBe(false);
    expect(canReadCampaignType('whatsapp-call', permissions)).toBe(false);
  });
});
