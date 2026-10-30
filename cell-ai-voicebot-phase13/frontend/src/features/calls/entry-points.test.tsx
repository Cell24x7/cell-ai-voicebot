import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { callsApi } from '@/services/api/calls';
import { signInAs } from '@/test/auth';
import { fakeCall } from '@/test/calls';
import { renderWithProviders } from '@/test/render';

import { RecentCallsCard } from './RecentCallsCard';
import { TestCallButton } from './TestCallButton';

vi.mock('@/services/api/calls', () => ({ callsApi: { list: vi.fn() } }));
const api = vi.mocked(callsApi);

const routes = (element: React.ReactNode) => [
  { path: '/', element },
  { path: '/calls/test', element: <div data-testid="tester">tester</div> },
  { path: '/calls/:id', element: <div>detail</div> },
  { path: '/calls', element: <div>all calls</div> },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue({
    success: true,
    data: [],
    meta: { hasMore: false, nextCursor: null },
  });
});

describe('TestCallButton', () => {
  it('flows: a menu for published / saved draft; draft-only flows go straight; unsaved changes block', async () => {
    const user = userEvent.setup();
    signInAs('agent');
    const first = renderWithProviders({
      routes: routes(<TestCallButton kind="flow" flowId="f1" publishedVersion={2} dirty={false} />),
    });
    await user.click(screen.getByRole('button', { name: 'Test call' }));
    await user.click(screen.getByRole('menuitem', { name: 'Published (v2)' }));
    expect(await screen.findByTestId('tester')).toBeInTheDocument();
    first.unmount();

    const draft = renderWithProviders({
      routes: routes(<TestCallButton kind="flow" flowId="f1" publishedVersion={2} dirty={false} />),
    });
    await user.click(screen.getByRole('button', { name: 'Test call' }));
    await user.click(screen.getByRole('menuitem', { name: 'Saved draft' }));
    expect(await screen.findByTestId('tester')).toBeInTheDocument();
    draft.unmount();

    const only = renderWithProviders({
      routes: routes(
        <TestCallButton kind="flow" flowId="f2" publishedVersion={null} dirty={false} />,
      ),
    });
    await user.click(screen.getByRole('button', { name: 'Test call' }));
    expect(await screen.findByTestId('tester')).toBeInTheDocument();
    only.unmount();

    renderWithProviders({
      routes: routes(<TestCallButton kind="flow" flowId="f1" publishedVersion={2} dirty />),
    });
    expect(screen.getByRole('button', { name: 'Test call' })).toBeDisabled();
    await user.hover(
      screen.getByRole('button', { name: 'Test call' }).parentElement as HTMLElement,
    );
    expect(await screen.findByText(/Save first/)).toBeInTheDocument();
  });

  it('agents: a link; off agents are blocked; viewers see nothing', () => {
    signInAs('agent');
    const on = renderWithProviders({
      routes: routes(<TestCallButton kind="agent" agentId="a1" active dirty={false} />),
    });
    expect(screen.getByRole('link', { name: 'Test call' })).toHaveAttribute(
      'href',
      '/calls/test?agentId=a1',
    );
    on.unmount();
    const off = renderWithProviders({
      routes: routes(<TestCallButton kind="agent" agentId="a1" active={false} dirty={false} />),
    });
    expect(screen.getByRole('link', { name: 'Test call' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    off.unmount();
    signInAs('viewer');
    renderWithProviders({
      routes: routes(<TestCallButton kind="agent" agentId="a1" active dirty={false} />),
    });
    expect(screen.queryByText('Test call')).not.toBeInTheDocument();
  });
});

describe('RecentCallsCard', () => {
  it('the last calls with status and cost; empty → make a test call; errors', async () => {
    signInAs('agent');
    api.list.mockResolvedValueOnce({
      success: true,
      data: [
        fakeCall(),
        fakeCall({ id: 'c2', contact: null, source: { ...fakeCall().source, name: null } }),
      ],
      meta: { hasMore: true, nextCursor: 'x' },
    });
    const first = renderWithProviders({ routes: routes(<RecentCallsCard />) });
    const card = screen.getByRole('region', { name: 'Recent calls' });
    expect(
      await within(card).findByRole('link', { name: 'Loan recovery · Asha Verma' }),
    ).toHaveAttribute('href', '/calls/c1');
    expect(within(card).getByRole('link', { name: 'Call · typed values' })).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith({ limit: 5 });
    first.unmount();
    const empty = renderWithProviders({ routes: routes(<RecentCallsCard />) });
    expect(await screen.findByRole('link', { name: 'Make a test call' })).toHaveAttribute(
      'href',
      '/calls/test',
    );
    empty.unmount();
    api.list.mockRejectedValueOnce(new Error('down'));
    renderWithProviders({ routes: routes(<RecentCallsCard />) });
    expect(await screen.findByText('Calls could not be loaded.')).toBeInTheDocument();
  });

  it('the dashboard shows it to roles with calls.read', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/' });
    expect(await screen.findByRole('region', { name: 'Recent calls' })).toBeInTheDocument();
    expect(await screen.findByText('No calls yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Make a test call' })).not.toBeInTheDocument();
  });
});
