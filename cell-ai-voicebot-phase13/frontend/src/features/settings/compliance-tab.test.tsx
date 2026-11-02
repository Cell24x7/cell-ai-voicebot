import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { accountApi } from '@/services/api/account';
import { ApiError } from '@/services/api/errors';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { saveBlob } from '@/utils/download';

import { ComplianceTab } from './ComplianceTab';

vi.mock('@/utils/download', () => ({ saveBlob: vi.fn() }));

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('x'))) },
}));
vi.mock('@/services/api/account', () => ({
  accountApi: { compliance: vi.fn(), complianceCsv: vi.fn() },
}));

const api = vi.mocked(accountApi);
const DATA = {
  callingWindow: { start: '09:00', end: '19:00', days: [1, 2] },
  ceiling: { start: '08:00', end: '19:00' },
  timezone: 'Asia/Kolkata',
  aiDisclosureEnabled: true,
  recordingEnabled: false,
  requireOptInForMarketing: false,
  optOutKeywords: ['STOP', 'BAND KARO'],
  counts: { contacts: 10, withConsent: 4, dnd: 2, optedOut: 1, suppressed: 3 },
};
const show = () => {
  signInAs('viewer');
  return renderWithProviders({ routes: [{ path: '/', element: <ComplianceTab /> }] });
};

afterEach(() => vi.clearAllMocks());

describe('ComplianceTab', () => {
  it('shows the rules and counts, and downloads the CSV', async () => {
    api.compliance.mockResolvedValue(DATA);
    api.complianceCsv.mockResolvedValue(new Blob(['x']));
    show();
    expect(await screen.findByText('09:00–19:00, Mon, Tue (Asia/Kolkata)')).toBeInTheDocument();
    expect(screen.getByText('08:00–19:00')).toBeInTheDocument();
    expect(screen.getByText('STOP, BAND KARO')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Download DND and opt-out changes' }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'compliance.csv'));
  });

  it('shows errors from loading and from the download', async () => {
    const err = new ApiError({ status: 500, code: 'X', message: 'Broken.', kind: 'http' });
    api.compliance.mockRejectedValueOnce(err);
    const first = show();
    expect(await screen.findByText('Broken.')).toBeInTheDocument();
    first.unmount();
    api.compliance.mockResolvedValue(DATA);
    api.complianceCsv.mockRejectedValue(
      new ApiError({ status: 403, code: 'Y', message: 'No.', kind: 'http' }),
    );
    show();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Download DND and opt-out changes' }),
    );
    expect(await screen.findByText('No.')).toBeInTheDocument();
  });
});
