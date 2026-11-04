import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { contactsApi } from '@/services/api/contacts';
import { whatsappApi } from '@/services/api/whatsapp';
import { whatsappCallingApi } from '@/services/api/whatsapp-calling';
import { signInAs } from '@/test/auth';
import { fakeCallPermission } from '@/test/calls-wa';
import { renderWithProviders } from '@/test/render';
import { fakeChannel } from '@/test/whatsapp';

import { ContactCallingCard } from './ContactCallingCard';
import { NewWhatsAppCallDialog } from './NewWhatsAppCallDialog';

vi.mock('@/services/api/whatsapp', async (original) => ({
  ...(await original<object>()),
  whatsappApi: { channels: vi.fn() },
}));
vi.mock('@/services/api/whatsapp-calling', async (original) => ({
  ...(await original<object>()),
  whatsappCallingApi: { permission: vi.fn(), getSettings: vi.fn() },
}));
vi.mock('@/services/api/contacts', async (original) => ({
  ...(await original<object>()),
  contactsApi: { list: vi.fn() },
}));

const CONTACT = { id: 'c1', phoneE164: '+919876543210', name: 'Asha Verma' };
const calling = (status: 'enabled' | 'disabled') => ({
  status,
  unavailableReason: null,
  restricted: false,
});

beforeEach(() => {
  signInAs('owner');
  vi.mocked(whatsappCallingApi.permission).mockResolvedValue(fakeCallPermission());
});
afterEach(() => vi.clearAllMocks());

describe('WhatsApp calling from contacts (Phase 18B)', () => {
  it('no calling-enabled number: nothing shown', async () => {
    vi.mocked(whatsappApi.channels).mockResolvedValue({
      items: [fakeChannel({ calling: calling('disabled') })],
    } as never);
    renderWithProviders({
      routes: [{ path: '/', element: <ContactCallingCard contact={CONTACT} /> }],
    });
    await waitFor(() => expect(whatsappApi.channels).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'WhatsApp calling' })).not.toBeInTheDocument();
  });

  it('a calling number: the permission panel; two numbers: a picker', async () => {
    vi.mocked(whatsappApi.channels).mockResolvedValue({
      items: [
        fakeChannel({ id: 'wa1', label: 'Main', calling: calling('enabled') }),
        fakeChannel({ id: 'wa2', label: 'Support', calling: calling('enabled') }),
      ],
    } as never);
    renderWithProviders({
      routes: [{ path: '/', element: <ContactCallingCard contact={CONTACT} /> }],
    });
    const card = await screen.findByRole('region', { name: 'WhatsApp calling' });
    await waitFor(() => expect(whatsappCallingApi.permission).toHaveBeenCalledWith('wa1', 'c1'));
    await userEvent.click(within(card).getByLabelText('From number'));
    await userEvent.click(await screen.findByRole('option', { name: 'Support' }));
    await waitFor(() => expect(whatsappCallingApi.permission).toHaveBeenCalledWith('wa2', 'c1'));
  });

  it('calls page dialog: search a contact, then the card', async () => {
    vi.mocked(whatsappApi.channels).mockResolvedValue({
      items: [fakeChannel({ id: 'wa1', calling: calling('enabled') })],
    } as never);
    vi.mocked(contactsApi.list).mockResolvedValue({ data: [CONTACT] } as never);
    renderWithProviders({
      routes: [{ path: '/', element: <NewWhatsAppCallDialog open onClose={() => undefined} /> }],
    });
    const dialog = await screen.findByRole('dialog', { name: 'New WhatsApp call' });
    expect(within(dialog).getByText(/Pick a contact/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Contact'), 'As');
    await userEvent.click(await screen.findByRole('option', { name: /Asha Verma/ }));
    expect(
      await within(dialog).findByRole('region', { name: 'WhatsApp calling' }),
    ).toBeInTheDocument();
    expect(contactsApi.list).toHaveBeenCalledWith({ q: 'As', limit: 10, page: 1 });
  });
});
