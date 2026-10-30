import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import { getSystemInfo } from '@/services/api/system';
import { renderWithProviders } from '@/test/render';

import { SystemInfoCard } from './SystemInfoCard';

vi.mock('@/services/api/system', () => ({ getSystemInfo: vi.fn() }));

const mocked = vi.mocked(getSystemInfo);
const routes = [{ path: '/', element: <SystemInfoCard /> }];
const info = {
  name: 'cell-ai-voicebot-backend',
  version: '0.0.1',
  node: 'v24.19.0',
  env: 'development',
};

afterEach(() => mocked.mockReset());

describe('SystemInfoCard', () => {
  it('shows a loading state, then the API info', async () => {
    mocked.mockResolvedValue(info);
    renderWithProviders({ routes });
    expect(screen.getByLabelText('Loading API status')).toBeInTheDocument();
    expect(await screen.findByText('cell-ai-voicebot-backend')).toBeInTheDocument();
    expect(screen.getByText(/Version 0\.0\.1 · development · Node v24\.19\.0/)).toBeInTheDocument();
  });

  it('shows the error with its request reference and retries', async () => {
    mocked.mockRejectedValueOnce(
      new ApiError({
        status: 503,
        code: 'PROVIDER_UNAVAILABLE',
        kind: 'http',
        message: 'Service down.',
        requestId: 'req_123',
      }),
    );
    renderWithProviders({ routes });
    expect(await screen.findByText('API unavailable: Service down.')).toBeInTheDocument();
    expect(screen.getByText('Ref: req_123')).toBeInTheDocument();

    mocked.mockResolvedValueOnce(info);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('cell-ai-voicebot-backend')).toBeInTheDocument());
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it('explains network failures in plain words', async () => {
    mocked.mockRejectedValue(
      new ApiError({ status: 0, code: 'NETWORK_ERROR', kind: 'network', message: 'x' }),
    );
    renderWithProviders({ routes });
    expect(
      await screen.findByText("API unavailable: Can't reach the server. Check your connection."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Ref:/)).not.toBeInTheDocument();
  });
});
