import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { templatesApi } from '@/services/api/templates';
import { whatsappApi } from '@/services/api/whatsapp';
import { whatsappCallingApi } from '@/services/api/whatsapp-calling';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakePricePreview, fakeTemplate, fakeTemplateListItem } from '@/test/templates';
import { fakeChannel } from '@/test/whatsapp';

import { BulkCallPermissionDialog } from './BulkCallPermissionDialog';

vi.mock('@/services/api/whatsapp', async (original) => ({
  ...(await original<object>()),
  whatsappApi: { channels: vi.fn(), pricePreview: vi.fn() },
}));
vi.mock('@/services/api/templates', async (original) => ({
  ...(await original<object>()),
  templatesApi: { list: vi.fn(), get: vi.fn() },
}));
vi.mock('@/services/api/whatsapp-calling', async (original) => ({
  ...(await original<object>()),
  whatsappCallingApi: { requestPermissionBulk: vi.fn(), permissionRun: vi.fn() },
}));

const calling = { status: 'enabled' as const, unavailableReason: null, restricted: false };
const perm = (id: string, status: 'APPROVED' | 'REJECTED' | 'PENDING', extra = {}) =>
  fakeTemplateListItem(status, 'UTILITY', {
    id,
    name: `call_permission_${id}`,
    purpose: 'call_permission',
    ...extra,
  });

const run = (over = {}) => ({
  id: 'run1',
  channelId: 'wa1',
  templateId: 'ok',
  status: 'done' as const,
  total: 3,
  sent: 1,
  failed: 0,
  skipped: { dnd: 1, wallet_empty: 1 },
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-11-04T10:00:00.000Z',
  ...over,
});

const open = (count: number | null = 3) =>
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <BulkCallPermissionDialog
            target={{ contactIds: ['c1', 'c2', 'c3'] }}
            count={count}
            onClose={() => undefined}
          />
        ),
      },
    ],
  });

beforeEach(() => {
  signInAs('owner');
  vi.mocked(whatsappApi.channels).mockResolvedValue({
    items: [fakeChannel({ id: 'wa1', calling })],
  } as never);
  vi.mocked(whatsappApi.pricePreview).mockResolvedValue(fakePricePreview());
  vi.mocked(templatesApi.list).mockResolvedValue([
    perm('bad', 'REJECTED', {
      statusReason: { reason: 'INVALID_FORMAT', title: null, description: 'Wrong format' },
    }),
    perm('ok', 'APPROVED'),
  ]);
  vi.mocked(templatesApi.get).mockResolvedValue(
    fakeTemplate('APPROVED', 'UTILITY', [{ type: 'BODY', text: 'Hi {{1}}, may we call?' }], {
      id: 'ok',
    }),
  );
});
afterEach(() => vi.clearAllMocks());

describe('BulkCallPermissionDialog (T18B.4)', () => {
  it('lists permission templates with status and rejection reason; only approved selectable', async () => {
    open();
    const dialog = await screen.findByRole('dialog', { name: 'Ask for WhatsApp call permission' });
    await waitFor(() =>
      expect(templatesApi.list).toHaveBeenCalledWith({
        channelId: 'wa1',
        purpose: 'call_permission',
      }),
    );
    await userEvent.click(within(dialog).getByLabelText('Template'));
    const rejected = await screen.findByRole('option', { name: /call_permission_bad/ });
    expect(rejected).toHaveAttribute('aria-disabled', 'true');
    expect(within(rejected).getByText('Wrong format')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /call_permission_ok/ })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('needs the ask variables, shows the estimate, sends and shows the result by reason', async () => {
    vi.mocked(whatsappCallingApi.requestPermissionBulk).mockResolvedValue({ runId: 'run1' });
    vi.mocked(whatsappCallingApi.permissionRun).mockResolvedValue(run());
    open();
    const dialog = await screen.findByRole('dialog', { name: 'Ask for WhatsApp call permission' });
    expect(await within(dialog).findByText(/× 3/)).toBeInTheDocument();
    const send = within(dialog).getByRole('button', { name: 'Send requests' });
    const input = await within(dialog).findByLabelText(/Value for \{\{1\}\}/);
    expect(send).toBeDisabled();
    await userEvent.type(input, 'Cell');
    await userEvent.click(send);
    await waitFor(() =>
      expect(whatsappCallingApi.requestPermissionBulk).toHaveBeenCalledWith(
        {
          channelId: 'wa1',
          target: { contactIds: ['c1', 'c2', 'c3'] },
          templateId: 'ok',
          variables: { '1': 'Cell' },
        },
        expect.any(String),
      ),
    );
    const table = await screen.findByRole('table', { name: 'Result' });
    expect(within(table).getByText('Skipped: On the do-not-call list')).toBeInTheDocument();
    expect(within(table).getByText('Skipped: Not sent: wallet empty')).toBeInTheDocument();
    expect(screen.getByText('Done.')).toBeInTheDocument();
  });

  it('more than 5,000 contacts: cannot send', async () => {
    open(5_001);
    const dialog = await screen.findByRole('dialog', { name: 'Ask for WhatsApp call permission' });
    expect(within(dialog).getByText(/at most 5,000/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send requests' })).toBeDisabled();
  });

  it('no calling number: points to the numbers page', async () => {
    vi.mocked(whatsappApi.channels).mockResolvedValue({
      items: [fakeChannel({ id: 'wa1', calling: { ...calling, status: 'disabled' as const } })],
    } as never);
    open();
    expect(await screen.findByText(/No number has WhatsApp calling on/)).toBeInTheDocument();
  });
});
