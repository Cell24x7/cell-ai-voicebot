import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ErrorPage } from '@/pages/ErrorPage';
import { ApiError } from '@/services/api/errors';
import { signInAs } from '@/test/auth';
import { formatInAccountTz } from '@/utils/datetime';

import { useConfirm } from './confirm-context';
import { ConfirmProvider } from './ConfirmProvider';
import { CopyButton } from './CopyButton';
import { DataTable } from './DataTable';
import { PageHeader } from './PageHeader';
import { RelativeTime } from './RelativeTime';
import { StatusChip } from './StatusChip';

describe('ConfirmProvider', () => {
  function Asker({ onResult }: { onResult: (ok: boolean) => void }) {
    const confirm = useConfirm();
    return (
      <button
        onClick={() =>
          void confirm({
            title: 'Remove member?',
            message: 'They lose access.',
            confirmText: 'Remove',
            destructive: true,
          }).then(onResult)
        }
      >
        ask
      </button>
    );
  }

  it('resolves true on confirm and false on cancel', async () => {
    const onResult = vi.fn();
    render(
      <ConfirmProvider>
        <Asker onResult={onResult} />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByText('ask'));
    expect(screen.getByRole('dialog', { name: 'Remove member?' })).toHaveTextContent(
      'They lose access.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(screen.getByText('ask'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(false));
  });

  it('throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Asker onResult={() => undefined} />)).toThrow(
      'useConfirm must be used inside <ConfirmProvider>',
    );
    spy.mockRestore();
  });
});

describe('DataTable', () => {
  const columns = [
    { key: 'name', header: 'Name', render: (r: { id: string; name: string }) => r.name },
  ];

  it('renders rows, empty state, loading and error with retry', async () => {
    const { rerender } = render(
      <DataTable
        columns={columns}
        rows={[{ id: '1', name: 'Asha' }]}
        getRowId={(r) => r.id}
        aria-label="People"
      />,
    );
    expect(screen.getByRole('table', { name: 'People' })).toHaveTextContent('Asha');
    rerender(
      <DataTable columns={columns} rows={[]} getRowId={(r) => r.id} emptyTitle="No members" />,
    );
    expect(screen.getByText('No members')).toBeInTheDocument();
    rerender(
      <DataTable
        columns={columns}
        rows={undefined}
        getRowId={(r) => r.id}
        loading
        aria-label="People"
      />,
    );
    expect(screen.getByRole('table', { name: 'People' })).toHaveAttribute('aria-busy', 'true');
    const onRetry = vi.fn();
    rerender(
      <DataTable
        columns={columns}
        rows={undefined}
        getRowId={(r) => r.id}
        error={new ApiError({ status: 0, code: 'NETWORK_ERROR', kind: 'network', message: 'x' })}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("Can't reach the server. Check your connection.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('paginates 1-based', async () => {
    const onPageChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={[{ id: '1', name: 'A' }]}
        getRowId={(r) => r.id}
        pagination={{ page: 1, limit: 20, total: 45, onPageChange }}
      />,
    );
    expect(screen.getByText('1–20 of 45')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

describe('small components', () => {
  it('RelativeTime shows "ago" with the account-timezone time', () => {
    signInAs('owner');
    render(<RelativeTime value={new Date(Date.now() - 3 * 60_000).toISOString()} />);
    expect(screen.getByText('3 minutes ago')).toBeInTheDocument();
    render(<RelativeTime value={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(formatInAccountTz('2026-10-08T00:00:00Z', 'Asia/Kolkata')).toBe('08 Oct 2026, 05:30');
  });

  it('CopyButton copies and confirms', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<CopyButton value="cav_test_abc" label="Copy key" />);
    await act(async () => {
      screen.getByRole('button', { name: 'Copy key' }).click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith('cav_test_abc');
  });

  it('StatusChip and PageHeader', () => {
    render(
      <>
        <StatusChip status="active" />
        <StatusChip status="weird" />
        <PageHeader title="Team" subtitle="People" actions={<button>Invite</button>} />
      </>,
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Weird')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(document.title).toBe('Team · Cell AI Voicebot');
  });

  it('PageHeader subtitles may hold chips (no <div> inside a <p>)', () => {
    render(<PageHeader title="October recovery" subtitle={<StatusChip status="active" />} />);
    expect(screen.getByText('Active').closest('p')).toBeNull();
  });
});

describe('ErrorPage', () => {
  it('shows the message and request reference of a crash', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          errorElement: <ErrorPage />,
          loader: () => {
            throw new ApiError({
              status: 500,
              code: 'INTERNAL_ERROR',
              kind: 'http',
              message: 'Boom',
              requestId: 'req_9',
            });
          },
          element: <p>ok</p>,
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();
    expect(screen.getByText('Ref: req_9')).toBeInTheDocument();
  });
});
