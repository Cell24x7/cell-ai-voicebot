import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import { insightsApi } from '@/services/api/insights';
import { outcomeRulesApi } from '@/services/api/outcome-rules';
import { templatesApi } from '@/services/api/templates';
import type { WhatsAppTemplateComponent } from '@/services/api/types';
import { whatsappApi } from '@/services/api/whatsapp';
import { signInAs } from '@/test/auth';
import { pick } from '@/test/inspector';
import { fakeRule } from '@/test/integrations';
import { renderWithProviders } from '@/test/render';
import { fakeTemplate, fakeTemplateListItem } from '@/test/templates';
import { fakeChannel } from '@/test/whatsapp';

import { AfterCallTab } from './AfterCallTab';

vi.mock('@/services/api/outcome-rules', () => ({
  outcomeRulesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));
vi.mock('@/services/api/templates', () => ({ templatesApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock('@/services/api/whatsapp', () => ({ whatsappApi: { channels: vi.fn() } }));
vi.mock('@/services/api/insights', () => ({ insightsApi: { dispositions: vi.fn() } }));

const api = vi.mocked(outcomeRulesApi);
const httpError = (message: string) =>
  new ApiError({ status: 409, code: 'OUTCOME_RULE_LIMIT', message, kind: 'http' });
const BODY: WhatsAppTemplateComponent[] = [
  { type: 'BODY', text: 'Hi {{1}}, please pay {{2}}.', example: { body_text: [['A', 'B']] } },
];
const show = () => renderWithProviders({ routes: [{ path: '/', element: <AfterCallTab /> }] });
const row = (text: string) => screen.getByRole('row', { name: new RegExp(text) });

beforeEach(() => {
  vi.clearAllMocks();
  signInAs('owner');
  api.list.mockResolvedValue([fakeRule()]);
  vi.mocked(whatsappApi.channels).mockResolvedValue({
    items: [fakeChannel(), fakeChannel({ id: 'wa2', label: 'Sales' })],
  } as never);
  vi.mocked(templatesApi.list).mockResolvedValue([
    fakeTemplateListItem(),
    fakeTemplateListItem('APPROVED', 'UTILITY', {
      id: 'tpl2',
      name: 'pay_link',
      variablesCount: 2,
    }),
  ]);
  vi.mocked(templatesApi.get).mockImplementation((id) =>
    Promise.resolve(
      id === 'tpl2'
        ? fakeTemplate('APPROVED', 'UTILITY', BODY, { id: 'tpl2', name: 'pay_link' })
        : fakeTemplate('APPROVED', 'UTILITY', BODY),
    ),
  );
  vi.mocked(insightsApi.dispositions).mockResolvedValue({
    dispositions: [
      { key: 'promise_to_pay', label: 'Promise to pay', active: true },
      { key: 'callback', label: 'Call back', active: true },
    ],
  });
});

describe('After the call tab', () => {
  it('lists rules with when / sends / at; empty and error states', async () => {
    api.list.mockResolvedValueOnce([
      fakeRule(),
      fakeRule({
        id: 'r2',
        name: 'Missed calls',
        active: false,
        when: { ...fakeRule().when, dispositions: [], hasPromise: null, notAnsweredInARow: 3 },
        send: { ...fakeRule().send, template: null },
        timing: { mode: 'after', delayMinutes: 30 },
      }),
    ]);
    const first = show();
    expect(await screen.findByText('Missed calls')).toBeInTheDocument();
    expect(
      within(row('Payment link')).getByText('When outcome promise_to_pay, a promise to pay'),
    ).toBeInTheDocument();
    expect(within(row('Payment link')).getByText('emi_reminder (en)')).toBeInTheDocument();
    expect(within(row('Payment link')).getByText('Right after the call')).toBeInTheDocument();
    expect(within(row('Missed calls')).getByText('Template removed')).toBeInTheDocument();
    expect(within(row('Missed calls')).getByText('30 min after the call')).toBeInTheDocument();
    first.unmount();

    api.list.mockResolvedValueOnce([]);
    const empty = show();
    expect(await screen.findByText('No rules yet')).toBeInTheDocument();
    empty.unmount();

    api.list.mockRejectedValueOnce(new Error('offline'));
    show();
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('turns a rule on / off and removes it (with errors)', async () => {
    api.update.mockRejectedValueOnce(httpError('not now')).mockResolvedValue(fakeRule());
    api.remove.mockRejectedValueOnce(httpError('locked')).mockResolvedValue(undefined);
    show();
    const toggle = await screen.findByRole('switch', {
      name: 'Turn off Payment link after a promise',
    });
    await userEvent.click(toggle);
    expect(api.update).toHaveBeenCalledWith('r1', { active: false });
    expect(await screen.findByText('not now')).toBeInTheDocument();
    await userEvent.click(toggle);
    await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));

    await userEvent.click(within(row('Payment link')).getByRole('button', { name: 'Remove' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(api.remove).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(within(row('Payment link')).getByRole('button', { name: 'Remove' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
    );
    expect(await screen.findByText('locked')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(within(row('Payment link')).getByRole('button', { name: 'Remove' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }),
    );
    expect(await screen.findByText('Rule removed')).toBeInTheDocument();
    expect(api.remove).toHaveBeenLastCalledWith('r1');
  });

  it('adds a rule: conditions, number, template values with a live preview, timing', async () => {
    api.create.mockRejectedValueOnce(httpError('At most 20 rules.')).mockResolvedValue(fakeRule());
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Add rule' }));
    const dialog = screen.getByRole('dialog', { name: 'Add an after-the-call rule' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(within(dialog).getByText('Choose a template to see a preview.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Name'), 'Pay link');
    expect(within(dialog).getByText('Choose an approved template')).toBeInTheDocument();
    await pick('Outcome (any if none chosen)', 'Promise to pay');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(within(dialog).getByLabelText('positive customer'));
    await userEvent.click(within(dialog).getByLabelText('negative customer'));
    await userEvent.click(within(dialog).getByLabelText('negative customer'));
    await pick('Promise to pay', 'Promise found');
    await userEvent.type(within(dialog).getByLabelText('Not answered N times in a row'), '2');
    await userEvent.click(within(dialog).getByLabelText('WhatsApp calls'));
    await pick('From number', /Sales/);
    await pick('Approved template', 'pay_link (en)');

    expect(
      await within(dialog).findByText('Give every template variable a value'),
    ).toBeInTheDocument();
    expect(await within(dialog).findByLabelText('Preview with sample values')).toBeInTheDocument();
    // {{1}} ← contact field "name", {{2}} ← AI insight promise_amount
    await userEvent.type(within(dialog).getAllByLabelText('Field key')[0] as HTMLElement, 'name');
    await pick('{{2}} from', 'AI insight');
    expect(save).toBeDisabled();
    await pick('Value', 'promise_amount');
    expect(within(dialog).getByText(/Hi Asha, please pay ₹2,500\./)).toBeInTheDocument();

    await pick('When', 'After some minutes');
    expect(within(dialog).getByText('Choose 1–1440 minutes')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Minutes after the call'), '30');
    expect(save).toBeEnabled();

    await userEvent.click(save);
    expect(await within(dialog).findByText('At most 20 rules.')).toBeInTheDocument();
    expect(api.create).toHaveBeenCalledWith({
      name: 'Pay link',
      when: {
        dispositions: ['promise_to_pay'],
        sentiment: ['positive'],
        hasPromise: true,
        notAnsweredInARow: 2,
        callKinds: ['phone'],
      },
      send: {
        channelId: 'wa2',
        templateId: 'tpl2',
        params: [
          { from: 'contact', key: 'name', value: null },
          { from: 'insights', key: 'promise_amount', value: null },
        ],
      },
      timing: { mode: 'after', delayMinutes: 30 },
    });
    await userEvent.click(save);
    expect(await screen.findByText('Rule added')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('changes a rule: fixed text and call values, back to both call kinds, cancel', async () => {
    api.list.mockResolvedValue([
      fakeRule({
        when: { ...fakeRule().when, callKinds: ['phone'] },
        send: {
          ...fakeRule().send,
          params: [
            { from: 'text', key: null, value: 'Sir' },
            { from: 'call', key: 'disposition', value: null },
          ],
        },
      }),
    ]);
    api.update.mockResolvedValue(fakeRule());
    show();
    await userEvent.click(
      await within(await screen.findByRole('row', { name: /Payment link/ })).findByRole('button', {
        name: 'Change',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Change rule' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Payment link after a promise');
    expect(await within(dialog).findByLabelText('Text')).toHaveValue('Sir');
    await userEvent.clear(within(dialog).getByLabelText('Text'));
    expect(within(dialog).getByText('Fill every value')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Text'), 'Madam');
    await pick('{{1}} from', 'Call value');
    await pick('Value', 'duration_sec');
    await pick('{{2}} from', 'Contact field');
    await userEvent.type(within(dialog).getByLabelText('Field key'), 'city');
    // phone only → tick WhatsApp again = both kinds (stored as "any")
    await userEvent.click(within(dialog).getByLabelText('WhatsApp calls'));
    await pick('From number', 'Default');
    expect(within(dialog).queryByText(/Fill every value|Give every|Choose/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Rule saved')).toBeInTheDocument();
    expect(api.update).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({
        when: expect.objectContaining({ callKinds: [] }) as unknown,
        send: {
          channelId: null,
          templateId: 'tpl1',
          params: [
            { from: 'call', key: 'duration_sec', value: null },
            { from: 'contact', key: 'city', value: null },
          ],
        },
      }),
    );

    await userEvent.click(within(row('Payment link')).getByRole('button', { name: 'Change' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('read-only without integrations.manage', async () => {
    signInAs('viewer');
    show();
    expect(await screen.findByText('Payment link after a promise')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add rule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Turn off Payment link after a promise' }),
    ).toBeDisabled();
  });
});
