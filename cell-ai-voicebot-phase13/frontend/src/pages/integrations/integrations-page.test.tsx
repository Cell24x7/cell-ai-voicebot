import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { outcomeRulesApi } from '@/services/api/outcome-rules';
import { sheetImportsApi } from '@/services/api/sheet-imports';
import type * as WebhooksModule from '@/services/api/webhooks';
import { webhooksApi } from '@/services/api/webhooks';
import { signInAs } from '@/test/auth';
import { renderWithProviders } from '@/test/render';

vi.mock('@/services/api/webhooks', async (importOriginal) => ({
  ...(await importOriginal<typeof WebhooksModule>()),
  webhooksApi: { list: vi.fn() },
}));
vi.mock('@/services/api/outcome-rules', () => ({ outcomeRulesApi: { list: vi.fn() } }));
vi.mock('@/services/api/sheet-imports', () => ({ sheetImportsApi: { list: vi.fn() } }));

beforeEach(() => {
  vi.mocked(webhooksApi.list).mockResolvedValue([]);
  vi.mocked(outcomeRulesApi.list).mockResolvedValue([]);
  vi.mocked(sheetImportsApi.list).mockResolvedValue([]);
});

const tabs = () => screen.getAllByRole('tab').map((t) => t.textContent);

describe('/integrations', () => {
  it('owners get all three tabs; /integrations opens Webhooks; tabs change the URL', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/integrations' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Integrations' }),
    ).toBeInTheDocument();
    expect(tabs()).toEqual(['Webhooks', 'After the call', 'Google Sheets']);
    expect(await screen.findByText('No webhooks yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'After the call' }));
    expect(await screen.findByText('No rules yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Google Sheets' }));
    expect(await screen.findByText('No Google Sheets yet')).toBeInTheDocument();
  });

  it('a deep link opens its tab', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/integrations/sheets' });
    expect(await screen.findByText('No Google Sheets yet')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Google Sheets' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('managers (contacts.import only) get Google Sheets; other tabs are forbidden', async () => {
    signInAs('manager');
    const first = renderWithProviders({ route: '/integrations' });
    expect(await screen.findByText('No Google Sheets yet')).toBeInTheDocument();
    expect(tabs()).toEqual(['Google Sheets']);
    first.unmount();

    renderWithProviders({ route: '/integrations/webhooks' });
    expect(await screen.findByText(/don.t have access|not allowed|403/i)).toBeInTheDocument();
  });

  it('an unknown tab goes to the first allowed tab', async () => {
    signInAs('owner');
    renderWithProviders({ route: '/integrations/nope' });
    expect(await screen.findByText('No webhooks yet')).toBeInTheDocument();
  });

  it('viewers cannot open the page', async () => {
    signInAs('viewer');
    renderWithProviders({ route: '/integrations' });
    expect(await screen.findByText(/don.t have access|not allowed|403/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Integrations' })).toBeNull();
  });
});
