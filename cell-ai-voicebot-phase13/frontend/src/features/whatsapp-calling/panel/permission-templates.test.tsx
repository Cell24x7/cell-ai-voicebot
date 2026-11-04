import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { templatesApi } from '@/services/api/templates';
import { whatsappCallingApi } from '@/services/api/whatsapp-calling';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeTemplateListItem } from '@/test/templates';

import { PermissionTemplateNotice } from './PermissionTemplates';
import { RequestPermissionDialog } from './RequestPermissionDialog';

vi.mock('@/services/api/templates', async (original) => ({
  ...(await original<object>()),
  templatesApi: { list: vi.fn() },
}));
vi.mock('@/services/api/whatsapp-calling', async (original) => ({
  ...(await original<object>()),
  whatsappCallingApi: { getSettings: vi.fn(), requestPermission: vi.fn() },
}));

const perm = (id: string, status: 'APPROVED' | 'REJECTED' | 'PENDING', extra = {}) =>
  fakeTemplateListItem(status, 'UTILITY', {
    id,
    name: `call_permission_${id}`,
    purpose: 'call_permission',
    ...extra,
  });
const rejected = perm('bad', 'REJECTED', {
  statusReason: { reason: 'INVALID_FORMAT', title: null, description: 'Wrong format' },
});

const show = (el: React.ReactElement) =>
  renderWithProviders({ routes: [{ path: '/', element: el }] });

beforeEach(() => signInAs('owner'));
afterEach(() => vi.clearAllMocks());

describe('permission template guide (T18B.5)', () => {
  it('none: "create one" links to the guided builder', async () => {
    vi.mocked(templatesApi.list).mockResolvedValue([]);
    show(<PermissionTemplateNotice channelId="wa1" />);
    expect(await screen.findByText(/No approved permission template/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute(
      'href',
      '/whatsapp/templates?create=call_permission',
    );
  });

  it('rejected: the reason and "Edit and resubmit"; pending: waiting; approved: nothing', async () => {
    vi.mocked(templatesApi.list).mockResolvedValue([rejected]);
    const { unmount } = show(<PermissionTemplateNotice channelId="wa1" />);
    expect(await screen.findByText('Wrong format')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit and resubmit' })).toBeInTheDocument();
    unmount();
    vi.mocked(templatesApi.list).mockResolvedValue([perm('p', 'PENDING')]);
    const second = show(<PermissionTemplateNotice channelId="wa2" />);
    expect(await screen.findByText(/waiting for WhatsApp review/)).toBeInTheDocument();
    second.unmount();
    vi.mocked(templatesApi.list).mockResolvedValue([perm('ok', 'APPROVED')]);
    show(<PermissionTemplateNotice channelId="wa3" />);
    await waitFor(() => expect(templatesApi.list).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('request dialog outside the window: only approved selectable, the chosen one is sent', async () => {
    vi.mocked(templatesApi.list).mockResolvedValue([
      rejected,
      perm('ok', 'APPROVED'),
      perm('ok2', 'APPROVED'),
    ]);
    vi.mocked(whatsappCallingApi.requestPermission).mockResolvedValue({
      messageId: 'm1',
      kind: 'template',
    });
    show(
      <RequestPermissionDialog
        channelId="wa1"
        contactId="c1"
        windowOpen={false}
        onClose={() => undefined}
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Ask to allow calls' });
    await userEvent.click(await within(dialog).findByLabelText('Template'));
    expect(await screen.findByRole('option', { name: /call_permission_bad/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.click(screen.getByRole('option', { name: /call_permission_ok2/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(whatsappCallingApi.requestPermission).toHaveBeenCalledWith({
        channelId: 'wa1',
        contactId: 'c1',
        templateId: 'ok2',
      }),
    );
  });

  it('request dialog without an approved template: cannot send, shows the create link', async () => {
    vi.mocked(templatesApi.list).mockResolvedValue([]);
    show(
      <RequestPermissionDialog
        channelId="wa1"
        contactId="c1"
        windowOpen={false}
        onClose={() => undefined}
      />,
    );
    expect(await screen.findByRole('link', { name: 'Create one' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
  });
});
