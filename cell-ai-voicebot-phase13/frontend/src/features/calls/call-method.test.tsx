import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { phoneNumbersApi, type PhoneLine } from '@/services/api/phone-numbers';
import type { WhatsAppChannel } from '@/services/api/types';
import { whatsappApi } from '@/services/api/whatsapp';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeChannel } from '@/test/whatsapp';

import { CallAction, CallMethodContent } from './CallMethodDialog';

vi.mock('@/features/whatsapp-calling/live/CallButton', () => ({
  CallButton: ({ channelId, contactId }: { channelId: string; contactId: string }) => (
    <button>
      Permission for {channelId}/{contactId}
    </button>
  ),
}));
vi.mock('./CallNowDialog', () => ({
  CallNowDialog: ({ callerNumberId }: { callerNumberId: string }) => (
    <p>Normal sender {callerNumberId}</p>
  ),
}));

const phone = {
  id: 'sip1',
  number: '+919000000001',
  label: 'Office',
  purpose: 'outbound',
  status: 'active',
} as PhoneLine['numbers'][number];
const ready = (id = 'wa1') =>
  fakeChannel({ id, calling: { status: 'enabled', restricted: false, unavailableReason: null } });
const mount = (
  channels: WhatsAppChannel[],
  numbers: PhoneLine['numbers'] = [],
  role: 'owner' | 'viewer' = 'owner',
) => {
  signInAs(role);
  vi.spyOn(phoneNumbersApi, 'line').mockResolvedValue({ line: 'sip', numbers });
  vi.spyOn(whatsappApi, 'channels').mockResolvedValue({ items: channels, counts: {}, limit: 10 });
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <CallMethodContent contactId="contact1" phoneE164="+919000000099" label="Test contact" />
        ),
      },
    ],
  });
};
beforeEach(() => vi.restoreAllMocks());

describe('shared call method and sender choice', () => {
  it('preselects a sole SIP sender and keeps it in the confirmation', async () => {
    mount([], [phone]);
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with normal call' }));
    expect(screen.getByText('Normal sender sip1')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'WhatsApp number' })).not.toBeInTheDocument();
  });
  it('WhatsApp only uses the consent pair for that sender/contact', async () => {
    mount([ready()]);
    expect(
      await screen.findByRole('button', { name: 'Permission for wa1/contact1' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Continue with normal call' }),
    ).not.toBeInTheDocument();
  });
  it('both methods require a choice and switching clears the other method action', async () => {
    mount([ready()], [phone]);
    await waitFor(() =>
      expect(screen.queryByText('Checking connected numbers…')).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Permission for/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Call method' }));
    await userEvent.click(screen.getByRole('option', { name: 'WhatsApp call' }));
    expect(screen.getByRole('button', { name: 'Permission for wa1/contact1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Call method' }));
    await userEvent.click(screen.getByRole('option', { name: 'Normal call (SIP)' }));
    expect(screen.queryByRole('button', { name: /Permission for/ })).not.toBeInTheDocument();
  });
  it('multiple WhatsApp senders require an explicit selection', async () => {
    mount([ready(), ready('wa2')]);
    const sender = await screen.findByRole('combobox', { name: 'WhatsApp number' });
    expect(screen.queryByRole('button', { name: /Permission for/ })).not.toBeInTheDocument();
    await userEvent.click(sender);
    await userEvent.click(screen.getAllByRole('option', { name: /Support line/ })[1]!);
    expect(screen.getByRole('button', { name: 'Permission for wa2/contact1' })).toBeInTheDocument();
  });
  it('messaging-only Business App explains why calls are unavailable', async () => {
    mount([fakeChannel({ mode: 'coexistence' })]);
    expect(await screen.findByText(/calls are unavailable on Business App/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Permission for/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WhatsApp numbers' })).toHaveAttribute(
      'href',
      '/whatsapp/numbers',
    );
  });
  it('read-only roles make no readiness request', () => {
    mount([], [], 'viewer');
    expect(screen.getByText('Your role cannot place calls.')).toBeInTheDocument();
    expect(phoneNumbersApi.line).not.toHaveBeenCalled();
    expect(whatsappApi.channels).not.toHaveBeenCalled();
  });
});

it('a contact-row call action opens the shared chooser and closes on Close', async () => {
  signInAs('owner');
  vi.spyOn(phoneNumbersApi, 'line').mockResolvedValue({ line: 'sip', numbers: [phone] });
  vi.spyOn(whatsappApi, 'channels').mockResolvedValue({ items: [], counts: {}, limit: 10 });
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: <CallAction contactId="contact1" phoneE164="+919000000099" label="Test contact" />,
      },
    ],
  });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Call' }));
  expect(await screen.findByRole('dialog', { name: 'Call now' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('retries failed connection readiness and then restores the SIP action', async () => {
  signInAs('owner');
  vi.spyOn(phoneNumbersApi, 'line')
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({ line: 'sip', numbers: [phone] });
  vi.spyOn(whatsappApi, 'channels').mockResolvedValue({ items: [], counts: {}, limit: 10 });
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: <CallMethodContent contactId="k1" phoneE164="+919000000099" label="Asha" />,
      },
    ],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: 'Continue with normal call' })).toBeEnabled();
});
