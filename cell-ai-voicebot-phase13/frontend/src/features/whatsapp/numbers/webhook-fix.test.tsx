import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { WebhookChip, WebhookFixButton } from './WebhookCheck';

afterEach(() => vi.clearAllMocks());

const check = (status: 'ok' | 'failed' | 'unknown', missing: string[] = []) => ({
  status,
  appSubscribed: status === 'ok',
  missingFields: missing,
  checkedAt: '2026-11-20T10:00:00Z',
  fixedAt: null,
  error: null,
});

describe('webhook check (SAC-T5)', () => {
  it('chip shows ok / failed / unknown', () => {
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <>
              <WebhookChip check={check('ok')} />
              <WebhookChip check={check('failed', ['calls'])} />
              <WebhookChip check={undefined} />
            </>
          ),
        },
      ],
    });
    expect(screen.getByText('Webhook ✓')).toBeVisible();
    expect(screen.getByText('Webhook ✗')).toBeVisible();
    expect(screen.getByText('Webhook ?')).toBeVisible();
  });

  it('Fix runs, shows each step and the result', async () => {
    const run = vi.fn(() =>
      Promise.resolve({
        webhookCheck: check('ok'),
        steps: [
          { key: 'app_subscribed' as const, ok: true, detail: null },
          { key: 'fields' as const, ok: true, detail: null },
          { key: 'fix_fields' as const, ok: true, detail: null },
        ],
      }),
    );
    renderWithProviders({
      routes: [{ path: '/', element: <WebhookFixButton run={run} invalidate={[['x']]} /> }],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Webhook check / Fix' }));
    await screen.findByText(/Meta delivers this number’s messages and calls/);
    const steps = within(screen.getByRole('list', { name: 'Webhook steps' }));
    expect(steps.getByText('✓ Added the missing webhook fields')).toBeVisible();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a failed fix explains what is still missing', async () => {
    const run = vi.fn(() =>
      Promise.resolve({
        webhookCheck: check('failed', ['calls']),
        steps: [
          { key: 'app_subscribed' as const, ok: true, detail: null },
          { key: 'fields' as const, ok: false, detail: 'Missing: calls' },
          { key: 'fix_fields' as const, ok: false, detail: 'Callback verification failed' },
        ],
      }),
    );
    renderWithProviders({
      routes: [{ path: '/', element: <WebhookFixButton run={run} invalidate={[]} /> }],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Webhook check / Fix' }));
    await screen.findByText(/still does not deliver/);
    expect(screen.getByText('Callback verification failed')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText(/still does not deliver/)).toBeNull());
  });
});
