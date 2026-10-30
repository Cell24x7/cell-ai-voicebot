import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { flowAudioApi } from '@/services/api/flow-audio';
import { signInAs } from '@/test/auth';
import { FAKE_FLOW_CATALOG, fakeFlow } from '@/test/flows';
import { renderWithProviders } from '@/test/render';
import { installXyflowMocks } from '@/test/xyflow';

import { FlowBuilder } from './FlowBuilder';

vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn() } }));
vi.mock('@/services/api/flow-audio', () => ({ flowAudioApi: { list: vi.fn() } }));

beforeAll(() => installXyflowMocks());
beforeEach(() => {
  vi.mocked(agentsApi.list).mockRejectedValue(new Error('offline'));
  vi.mocked(flowAudioApi.list).mockRejectedValue(new Error('offline'));
});

describe('FlowBuilder extras', () => {
  it('stats overlay, highlight, issue badges, form, toolbar, side panel and state reports', async () => {
    signInAs('owner');
    const onState = vi.fn();
    const flow = fakeFlow({
      issues: [
        {
          severity: 'error',
          code: 'node_unconfigured',
          message: 'Greeting text missing',
          nodeId: 'greet',
        },
        { severity: 'warning', code: 'speak_long', message: 'Long', nodeId: 'menu' },
        { severity: 'error', code: 'no_ending', message: 'No ending' },
      ],
    });
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <FlowBuilder
              flow={flow}
              catalog={FAKE_FLOW_CATALOG}
              readOnly={false}
              canPublish={false}
              highlightId="menu"
              stats={
                new Map([
                  [
                    'menu',
                    { nodeId: 'menu', entered: 7, exits: { key_k1: 5 }, errors: 1, avgMs: 20 },
                  ],
                ])
              }
              toolbar={<button type="button">Simulator</button>}
              side={<aside aria-label="Side panel">side</aside>}
              renderForm={(node, apply) => (
                <button
                  type="button"
                  onClick={() => apply({ ...node.config, text: 'Changed text' })}
                >
                  Change {node.id}
                </button>
              )}
              renderDialogs={(graph) => <p>Variables: {graph.variables.length}</p>}
              onState={onState}
            />
          ),
        },
      ],
    });
    const menu = await screen.findByTestId('flow-node-menu');
    expect(within(menu).getByTestId('flow-stat-menu')).toHaveTextContent('7 in · 1 errors');
    expect(within(menu).getByText('Press 1 · Yes (5)')).toBeInTheDocument();
    expect(within(menu).getByLabelText('1 warnings')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('flow-node-greet')).getByLabelText('1 problems'),
    ).toBeInTheDocument();
    expect(screen.getByText('2 problems to fix before publishing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simulator' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Side panel' })).toBeInTheDocument();
    expect(screen.getByText('Variables: 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    // graph-level issues can't be focused
    expect(screen.getByText('No ending').closest('.Mui-disabled')).not.toBeNull();
    await userEvent.click(screen.getByText('Greeting text missing'));
    await userEvent.click(await screen.findByRole('button', { name: 'Change greet' }));
    expect(
      within(screen.getByTestId('flow-node-greet')).getByText('Changed text'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(onState).toHaveBeenLastCalledWith(
        expect.objectContaining({ dirty: true, revision: 3 }),
      ),
    );
  });
});
