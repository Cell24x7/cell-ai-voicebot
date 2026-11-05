import type { PhoneLine } from '@/services/api/phone-numbers';
import type { WhatsAppChannel } from '@/services/api/types';

export type CampaignType = 'phone' | 'whatsapp' | 'whatsapp-call';
export const CAMPAIGN_TYPES: { value: CampaignType; label: string }[] = [
  { value: 'phone', label: 'SIP / Normal call' },
  { value: 'whatsapp', label: 'WhatsApp bulk campaign' },
  { value: 'whatsapp-call', label: 'WhatsApp call' },
];

export const canReadCampaignType = (type: CampaignType, permissions: ReadonlySet<string>) =>
  permissions.has(type === 'whatsapp' ? 'whatsapp.campaigns.read' : 'campaigns.read');

/** Messaging and calling are separate capabilities, even on the same number. */
export const whatsappCapabilities = (channel: WhatsAppChannel) => {
  const messaging = channel.status === 'connected';
  const reason = !messaging
    ? 'Connect this WhatsApp number first'
    : channel.mode === 'coexistence' || channel.isOnBizApp
      ? 'WhatsApp calls are unavailable on Business App numbers'
      : channel.calling.status !== 'enabled'
        ? (channel.calling.unavailableReason ?? 'Enable WhatsApp calling on this number')
        : channel.calling.restricted
          ? 'Calling is restricted on this number'
          : null;
  return { messaging, calling: reason === null, reason };
};

/** Readiness is rechecked by the backend; these public facts only drive choices. */
export const callMethods = (input: {
  canCall: boolean;
  phoneLine?: PhoneLine;
  channels: readonly WhatsAppChannel[];
}) => ({
  phone:
    input.canCall &&
    input.phoneLine?.line === 'sip' &&
    input.phoneLine.numbers.some((n) => n.status === 'active' && n.purpose === 'outbound'),
  whatsapp: input.canCall ? input.channels.filter((n) => whatsappCapabilities(n).calling) : [],
});
