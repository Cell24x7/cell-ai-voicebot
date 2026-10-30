import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import type { LedgerEntry } from '@/services/api/types';

import { LedgerDetailDrawer } from './LedgerDetailDrawer';

const R = 1_000_000;
const callCharge = (ref: LedgerEntry['ref'], telephonyMicros: number): LedgerEntry => ({
  id: 'l9',
  type: 'call_charge',
  direction: 'debit',
  status: 'captured',
  amountMicros: 895_000,
  currency: 'INR',
  balanceAfterMicros: 999 * R,
  breakdown: {
    telephonyMicros,
    aiMicros: 0,
    ttsMicros: 600_000,
    commissionMicros: 295_000,
    answered: true,
    durationSec: 26,
    kind: 'call',
  },
  ref,
  holdId: 'h1',
  description: 'Call charge',
  note: null,
  createdBy: null,
  releasedAt: null,
  releaseReason: null,
  createdAt: '2026-10-15T10:00:30Z',
});

const show = (entry: LedgerEntry) => {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <LedgerDetailDrawer entry={entry} open timezone="Asia/Kolkata" onClose={() => undefined} />
      ),
    },
  ]);
  return render(<RouterProvider router={router} />);
};

describe('LedgerDetailDrawer — calls', () => {
  it('a web test call says it used no phone line and links to the call', () => {
    show(callCharge({ type: 'call', id: 'c1' }, 0));
    expect(screen.getByText('₹0.00 (web test call — no phone line)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call · c1' })).toHaveAttribute('href', '/calls/c1');
    expect(screen.getByText('Call')).toBeInTheDocument(); // "Used for"
  });

  it('a phone call shows its telephony charge; other sources stay plain text', () => {
    show(callCharge({ type: 'campaign', id: 'cmp1' }, 2 * R));
    expect(screen.getByText('₹2.00')).toBeInTheDocument();
    expect(screen.getByText('Campaign · cmp1')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Call ·/ })).not.toBeInTheDocument();
  });
});
