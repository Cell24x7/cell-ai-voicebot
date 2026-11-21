import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AxiosAdapter } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '@/services/api/auth';
import { apiClient } from '@/services/api/client';
import { renderWithProviders } from '@/test/render';

import { StepUpDialog } from './StepUpDialog';

vi.mock('@/services/api/auth', () => ({
  authApi: { stepUpLoginAs: vi.fn(() => Promise.resolve({ stepUpUntil: 'x' })) },
}));

const original = apiClient.defaults.adapter;
afterEach(() => {
  apiClient.defaults.adapter = original;
  vi.clearAllMocks();
});

/** 428 STEP_UP_REQUIRED first, then 200. */
const stepUpAdapter = (): { adapter: AxiosAdapter; calls: () => number } => {
  let n = 0;
  const adapter: AxiosAdapter = (config) => {
    n += 1;
    if (n === 1)
      return Promise.reject(
        Object.assign(new Error('428'), {
          isAxiosError: true,
          config,
          response: {
            status: 428,
            data: {
              success: false,
              error: { code: 'STEP_UP_REQUIRED', message: 'Confirm', details: [] },
            },
            headers: {},
            config,
            statusText: '',
          },
        }),
      );
    return Promise.resolve({
      status: 202,
      data: { data: { ok: true } },
      headers: {},
      config,
      statusText: '',
    });
  };
  return { adapter, calls: () => n };
};

describe('step-up (SAC-T3)', () => {
  it('a 428 opens the dialog; the superadmin password is sent and the request retried once', async () => {
    const { adapter, calls } = stepUpAdapter();
    apiClient.defaults.adapter = adapter;
    renderWithProviders({ routes: [{ path: '/', element: <StepUpDialog /> }] });
    const request = apiClient.post('/account/export', {});
    await screen.findByText('Confirm with your password');
    await userEvent.type(screen.getByLabelText('Your password'), 'my-own-password');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    const res = await request;
    expect(res.status).toBe(202);
    expect(calls()).toBe(2);
    expect(authApi.stepUpLoginAs).toHaveBeenCalledWith({ password: 'my-own-password' });
  });

  it('Cancel keeps the original error', async () => {
    const { adapter, calls } = stepUpAdapter();
    apiClient.defaults.adapter = adapter;
    renderWithProviders({ routes: [{ path: '/', element: <StepUpDialog /> }] });
    const request = apiClient.post('/account/export', {}).catch((e: { code: string }) => e.code);
    await screen.findByText('Confirm with your password');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await request).toBe('STEP_UP_REQUIRED');
    await waitFor(() => expect(calls()).toBe(1));
  });
});
