import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import { retentionApi } from '@/services/api/retention';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';
import { fakeRetention } from '@/test/retention';

import {
  bodyOf,
  daysText,
  draftOf,
  effectiveOf,
  fieldProblem,
  shorteningOf,
  type RetentionDraft,
} from './retention';

vi.mock('@/services/api/retention', () => ({
  retentionApi: { get: vi.fn(), update: vi.fn() },
}));

const api = vi.mocked(retentionApi);
const empty: RetentionDraft = { recordingsDays: '', callsDays: '', inboxDays: '' };

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(fakeRetention());
});

describe('retention helpers', () => {
  it('drafts, bodies, effective days and problems', () => {
    const r = fakeRetention({
      settings: { recordingsDays: 7, callsDays: 30, inboxDays: null },
    });
    expect(draftOf(r)).toEqual({ recordingsDays: '7', callsDays: '30', inboxDays: '' });
    expect(bodyOf({ recordingsDays: '', callsDays: '30', inboxDays: ' ' })).toEqual({
      recordingsDays: null,
      callsDays: 30,
      inboxDays: null,
    });
    expect(effectiveOf(r, empty)).toEqual({ recordingsDays: 180, callsDays: 180, inboxDays: 90 });
    expect(effectiveOf(r, { ...empty, callsDays: '30', recordingsDays: '60' })).toEqual({
      recordingsDays: 30,
      callsDays: 30,
      inboxDays: 90,
    });
    const forever = fakeRetention({
      platform: { callsDays: 180, inboxDays: null },
      bounds: { ...r.bounds, inboxDays: { min: 30, max: 3650 } },
    });
    expect(effectiveOf(forever, empty).inboxDays).toBeNull();
    expect(effectiveOf(forever, { ...empty, inboxDays: '400' }).inboxDays).toBe(400);
    expect(fieldProblem(r, { ...empty, callsDays: '6' }, 'callsDays')).toBe(
      'Between 7 and 180 days',
    );
    expect(fieldProblem(r, { ...empty, callsDays: '7.5' }, 'callsDays')).toBe('Whole days only');
    expect(
      fieldProblem(r, { ...empty, callsDays: '30', recordingsDays: '31' }, 'recordingsDays'),
    ).toBe('Between 1 and 30 days');
    expect(fieldProblem(r, { ...empty, inboxDays: '91' }, 'inboxDays')).toBe(
      'Between 30 and 90 days',
    );
    expect(fieldProblem(r, empty, 'inboxDays')).toBeNull();
    expect(daysText(1)).toBe('1 day');
    expect(daysText(null)).toBe('kept forever');
  });

  it('lists what a shorter period deletes', () => {
    const r = fakeRetention();
    expect(shorteningOf(r, empty)).toEqual([]);
    expect(shorteningOf(r, { recordingsDays: '7', callsDays: '30', inboxDays: '60' })).toEqual([
      'Recordings older than 7 days will be deleted tonight.',
      'Call records older than 30 days will be deleted tonight.',
      'WhatsApp messages older than 60 days will be deleted tonight.',
    ]);
  });
});

describe('Settings → Data retention', () => {
  it('saves a shorter period after confirming what gets deleted', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.update.mockResolvedValue(
      fakeRetention({
        settings: { recordingsDays: 7, callsDays: null, inboxDays: null },
        effective: { recordingsDays: 7, callsDays: 180, inboxDays: 90 },
      }),
    );
    renderWithProviders({ route: '/settings/retention' });
    const recordings = await screen.findByLabelText('Call recordings (days)');
    expect(screen.getByLabelText('Call records (days)')).toHaveAttribute(
      'placeholder',
      'Platform default (180 days)',
    );
    expect(screen.getByText(/Report numbers \(daily totals\) are not/)).toBeInTheDocument();
    await user.type(recordings, '7');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete older data?' });
    expect(
      within(dialog).getByText(/Recordings older than 7 days will be deleted tonight/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.update).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Save and delete' }),
    );
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith({
        recordingsDays: 7,
        callsDays: null,
        inboxDays: null,
      }),
    );
    expect(await screen.findByText('Data retention saved')).toBeInTheDocument();
  });

  it('a longer period saves without asking; bad values block saving; server errors show', async () => {
    const user = userEvent.setup();
    signInAs('admin');
    api.get.mockResolvedValue(
      fakeRetention({
        settings: { recordingsDays: null, callsDays: 30, inboxDays: null },
        effective: { recordingsDays: 30, callsDays: 30, inboxDays: 90 },
        cap: { callsDays: 120, inboxDays: null },
        bounds: {
          recordingsDays: { min: 1, max: 120 },
          callsDays: { min: 7, max: 120 },
          inboxDays: { min: 30, max: 90 },
        },
      }),
    );
    api.update.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'RETENTION_OUT_OF_BOUNDS',
        message: 'Keep call records between 7 and 120 days.',
        kind: 'http',
      }),
    );
    renderWithProviders({ route: '/settings/retention' });
    expect(await screen.findByText(/The platform team set a limit/)).toBeInTheDocument();
    const calls = screen.getByLabelText('Call records (days)');
    await user.clear(calls);
    await user.type(calls, '121');
    expect(screen.getByText('Between 7 and 120 days')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.clear(calls);
    await user.type(calls, '90');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText(/Keep call records between 7 and 120/)).toBeInTheDocument();
  });

  it('is read-only without account.update and shows load errors', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/settings/retention' });
    expect(await screen.findByLabelText('Call records (days)')).toBeDisabled();
    expect(screen.getByText('Only the owner or an admin can change this.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('retries after a failed load', async () => {
    const user = userEvent.setup();
    signInAs('owner');
    api.get.mockRejectedValueOnce(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'Down', kind: 'http' }),
    );
    renderWithProviders({ route: '/settings/retention' });
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Call records (days)')).toBeInTheDocument();
  });
});
