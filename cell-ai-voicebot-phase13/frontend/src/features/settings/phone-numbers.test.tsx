import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as PhoneNumbersModule from '@/services/api/phone-numbers';
import { phoneNumbersApi } from '@/services/api/phone-numbers';
import type { InboundNumber } from '@/services/api/types';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

import { draftOf, inboundProblems } from './inbound';

/** Phase 20 (P20-T7): Settings → Phone numbers — who answers incoming calls. */

vi.mock('@/services/api/phone-numbers', async (importOriginal) => ({
  ...(await importOriginal<typeof PhoneNumbersModule>()),
  phoneNumbersApi: { inbound: vi.fn(), updateInbound: vi.fn(), line: vi.fn() },
}));
vi.mock('@/services/api/team', () => ({ teamApi: { list: vi.fn() } }));
const api = vi.mocked(phoneNumbersApi);

const number = (over: Partial<InboundNumber['inbound']> = {}): InboundNumber => ({
  id: 'n1',
  number: '+911600000001',
  label: 'Support line',
  purpose: 'inbound',
  status: 'active',
  inbound: {
    enabled: false,
    route: 'ai',
    program: null,
    greeting: '',
    ringUserIds: null,
    ringTimeoutSec: 30,
    callHours: { enabled: false, timezone: 'Asia/Kolkata', weekly: [], holidays: [] },
    afterHours: { action: 'message', message: 'Office band hai.' },
    updatedAt: null,
    ...over,
  },
  readiness: {
    line: true,
    server: true,
    program: false,
    teamMembers: 2,
    problems: [
      'Incoming calls are off for this number',
      'Choose a published flow or an active AI agent',
    ],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  api.inbound.mockResolvedValue([number()]);
  api.updateInbound.mockImplementation((_id, body) =>
    Promise.resolve({ ...number(), inbound: { ...number().inbound, ...body } }),
  );
});

describe('incoming call form checks', () => {
  it('AI routes need a program; ring time and messages are bounded', () => {
    const d = draftOf(number());
    expect(inboundProblems(d).program).toBe('Choose a flow or an AI agent');
    expect(inboundProblems({ ...d, route: 'team' }).program).toBeUndefined();
    expect(
      inboundProblems({ ...d, route: 'team', ringTimeoutSec: 5, ringUserIds: [] }),
    ).toMatchObject({
      ringTimeoutSec: 'Between 10 and 120 seconds',
      ringUserIds: 'Choose at least one person',
    });
    expect(
      inboundProblems({
        ...d,
        route: 'team',
        afterHours: { action: 'message', message: ' ' },
      }).afterHours,
    ).toBe('1 to 200 characters');
  });
});

describe('Settings → Phone numbers', () => {
  it(
    'lists the number with what is missing; an owner turns on team calls',
    { timeout: 30_000 },
    async () => {
      signInAs('owner');
      renderWithProviders({ route: '/settings/phone-numbers' });
      const card = await screen.findByRole('article', { name: 'Support line' });
      expect(within(card).getByText('Off')).toBeInTheDocument();
      expect(within(card).getByText('Incoming calls are off for this number')).toBeInTheDocument();
      await userEvent.click(within(card).getByRole('button', { name: 'Edit' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByLabelText('Take calls on this number'));
      // role queries are slow on this big dialog: inputs by value / label
      await userEvent.click(within(dialog).getByDisplayValue('team'));
      await userEvent.type(within(dialog).getByLabelText(/Greeting/), 'Namaste');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(api.updateInbound).toHaveBeenCalledTimes(1));
      expect(api.updateInbound.mock.calls[0]).toEqual([
        'n1',
        expect.objectContaining({
          enabled: true,
          route: 'team',
          program: null,
          greeting: 'Namaste',
        }),
      ]);
    },
  );

  it('viewers see the numbers without Edit', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/settings/phone-numbers' });
    const card = await screen.findByRole('article', { name: 'Support line' });
    expect(within(card).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
