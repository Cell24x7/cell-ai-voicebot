import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import { templatesApi } from '@/services/api/templates';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeWaEstimate } from '@/test/whatsapp-campaigns';

import { api } from './test-setup';

vi.mock('@/services/api/whatsapp-campaigns', () => ({
  waCampaignsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    estimate: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    retryFailed: vi.fn(),
    recipients: vi.fn(),
    report: vi.fn(),
    export: vi.fn(),
  },
}));
vi.mock('@/services/api/whatsapp', () => ({ whatsappApi: { channels: vi.fn() } }));
vi.mock('@/services/api/templates', () => ({ templatesApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock('@/services/api/contact-lists', () => ({ contactListsApi: { list: vi.fn() } }));
vi.mock('@/services/api/segments', () => ({ segmentsApi: { list: vi.fn() } }));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));
vi.mock('@/services/api/contacts', () => ({
  contactsApi: { list: vi.fn(), get: vi.fn(), tags: vi.fn() },
}));
vi.mock('@/services/api/contact-imports', () => ({ contactImportsApi: { list: vi.fn() } }));

const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));
async function choose(label: string, option: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
}
async function toReview() {
  signInAs('manager');
  renderWithProviders({ route: '/campaigns/whatsapp/new?listId=l1' });
  await screen.findByLabelText(/Campaign name/);
  fireEvent.change(screen.getByLabelText(/Campaign name/), {
    target: { value: 'November reminders' },
  });
  await choose('WhatsApp number', '+91 90000 12345');
  next();
  await choose('Template', 'emi_reminder (UTILITY)');
  next();
  await screen.findByLabelText('Source');
  await choose('Source', 'Contact name');
  next();
  await screen.findByRole('combobox', { name: 'Lists' });
  next();
  await screen.findByRole('radio', { name: 'Start now' });
  next();
  return screen.findByRole('button', { name: 'Start campaign' });
}

describe('WhatsApp campaign wizard', () => {
  it('validates number, template, required variable, audience and schedule before saving', async () => {
    signInAs('manager');
    renderWithProviders({ route: '/campaigns/whatsapp/new' });
    await screen.findByRole('button', { name: 'Next' });
    next();
    expect(await screen.findByText(/Give the campaign a name/)).toBeInTheDocument();
    expect(screen.getByText('Pick a WhatsApp number')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Campaign name/), { target: { value: 'Reminder' } });
    await choose('WhatsApp number', '+91 90000 12345');
    next();
    next();
    expect(await screen.findByText('Pick at least one approved template')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByLabelText('Template'));
    expect(
      await screen.findByRole('option', { name: 'emi_reminder (UTILITY)' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /flagged_template/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'emi_reminder (UTILITY)' }));
    next();
    await screen.findByLabelText('Source');
    next();
    expect(
      await screen.findByText('Choose a source for every template variable'),
    ).toBeInTheDocument();
    await choose('Source', 'Fixed text');
    next();
    expect(await screen.findByText(/variable still need a value/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Customer' } });
    next();
    await screen.findByRole('combobox', { name: 'Lists' });
    next();
    expect(await screen.findByText(/Pick who gets the message/)).toBeInTheDocument();
    await choose('Lists', 'November customers');
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    next();
    fireEvent.click(await screen.findByRole('radio', { name: 'Later' }));
    next();
    expect(await screen.findByText('"Start at" must be in the future')).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('saves the selected audience and mappings, estimates by market, and starts with a stable retry key', async () => {
    const start = await toReview();
    await waitFor(() => expect(start).toBeEnabled());
    const body = api.create.mock.calls[0]?.[0];
    expect(body?.audience.listIds).toEqual(['l1']);
    expect(body?.variables).toEqual({ '1': { kind: 'contact.name', value: null } });
    expect(screen.getByText(/IN.*50/)).toBeInTheDocument();
    api.start.mockRejectedValueOnce(
      new ApiError({
        status: 0,
        kind: 'network',
        code: 'NETWORK_ERROR',
        message: 'Connection lost',
      }),
    );
    fireEvent.click(start);
    expect(await screen.findByText(/Check your connection|Connection lost/)).toBeInTheDocument();
    const key = api.start.mock.calls[0]?.[1];
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    fireEvent.click(screen.getByRole('button', { name: 'Start campaign' }));
    await waitFor(() => expect(api.start).toHaveBeenCalledTimes(2));
    expect(api.start.mock.calls[1]?.[1]).toBe(key);
  });

  it.each(['short', 'empty', 'error'] as const)(
    'blocks starting when estimate is %s',
    async (state) => {
      if (state === 'error') api.estimate.mockRejectedValue(new Error('Estimate unavailable'));
      else
        api.estimate.mockResolvedValue(
          fakeWaEstimate(
            state === 'short' ? { enough: false, walletAvailableMicros: 0 } : { recipients: 0 },
          ),
        );
      const start = await toReview();
      await waitFor(() => expect(api.estimate).toHaveBeenCalled());
      expect(start).toBeDisabled();
      expect(api.start).not.toHaveBeenCalled();
      if (state === 'short')
        expect(await screen.findByText(/Not enough credit to start/)).toBeInTheDocument();
    },
  );

  it('keeps a saved draft on estimate failure and edits it instead of creating a duplicate', async () => {
    const user = userEvent.setup();
    api.estimate.mockRejectedValueOnce(new Error('offline'));
    await toReview();
    await waitFor(() => expect(api.estimate).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    next();
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('wc1', expect.anything()));
    expect(api.create).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start campaign' })).toBeEnabled(),
    );
  });

  it('shows a template load error and does not advance past variables', async () => {
    vi.mocked(templatesApi.get).mockRejectedValue(new Error('Template offline'));
    signInAs('manager');
    renderWithProviders({ route: '/campaigns/whatsapp/wc1/edit' });
    await screen.findByRole('button', { name: 'Next' });
    next();
    next();
    await waitFor(() => expect(templatesApi.get).toHaveBeenCalled());
    next();
    expect(await screen.findByText(/Wait for the templates to load/)).toBeInTheDocument();
    expect(api.update).not.toHaveBeenCalled();
  });
});
