import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { flowsApi } from '@/services/api/flows';
import { signInAs } from '@/test/auth';
import { fakeFlowRow } from '@/test/flows';
import { renderWithProviders } from '@/test/render';

import { CallSetup } from './CallSetup';

vi.mock('@/services/api/flows', () => ({
  flowsApi: { list: vi.fn(), variables: vi.fn(() => Promise.resolve([])) },
}));

describe('CallSetup flow search', () => {
  it('keeps the prefilled flow while the picker searches (Start call stays enabled)', async () => {
    signInAs('agent');
    vi.mocked(flowsApi.list)
      .mockResolvedValueOnce({
        success: true,
        data: [fakeFlowRow()],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      })
      // the search the input's own label starts never answers
      .mockReturnValue(new Promise(() => undefined));
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <CallSetup
              prefill={{ flowId: 'f1', version: 'draft' }}
              busy={false}
              fieldErrors={new Map()}
              onStart={vi.fn()}
            />
          ),
        },
      ],
    });
    const start = screen.getByRole('button', { name: 'Start call' });
    await waitFor(() => expect(start).toBeEnabled());
    await waitFor(() =>
      expect(flowsApi.list).toHaveBeenLastCalledWith({ q: 'Loan recovery', limit: 20 }),
    );
    expect(screen.getByRole('combobox', { name: 'Flow' })).toHaveValue('Loan recovery');
    expect(start).toBeEnabled();
  });
});
