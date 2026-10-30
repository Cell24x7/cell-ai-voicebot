import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/services/api/errors';
import { useWsStatus } from '@/services/realtime';

import { Providers } from './providers';

function Failing({ status, silent = false }: { status: number; silent?: boolean }) {
  useQuery({
    queryKey: ['failing', status, silent],
    queryFn: () =>
      Promise.reject(
        new ApiError({
          status,
          code: 'X',
          kind: 'http',
          message: `Boom ${status}`,
          requestId: 'req_toast_1234',
        }),
      ),
    retry: false,
    meta: { silent },
  });
  return <span>{useWsStatus()}</span>;
}

describe('Providers', () => {
  it('shows a global toast for unexpected errors (with the request reference)', async () => {
    render(
      <Providers>
        <Failing status={500} />
      </Providers>,
    );
    expect(await screen.findByText('Boom 500 (Ref: req_toas)')).toBeInTheDocument();
  });

  it('keeps realtime disabled until Phase 2 (status idle)', () => {
    render(
      <Providers>
        <Failing status={404} />
      </Providers>,
    );
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('does not toast 4xx or silent queries', async () => {
    render(
      <Providers>
        <Failing status={404} />
        <Failing status={503} silent />
      </Providers>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/^Boom/)).not.toBeInTheDocument();
  });
});
