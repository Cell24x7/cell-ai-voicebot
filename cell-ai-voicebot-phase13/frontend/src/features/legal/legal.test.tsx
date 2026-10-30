import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import privacySource from '@/content/legal/privacy.md?raw';
import termsSource from '@/content/legal/terms.md?raw';
import { ContactPage } from '@/pages/legal/ContactPage';
import { PrivacyPage } from '@/pages/legal/PrivacyPage';
import { TermsPage } from '@/pages/legal/TermsPage';
import { metaPublicApi } from '@/services/api/meta-public';
import { renderWithProviders } from '@/test/render';

import { legalValues } from './config';
import { LegalPage } from './LegalPage';
import { LEGAL_LINKS } from './links';
import { fillPlaceholders, parseInline, parseLegal, safeHref } from './markdown';

vi.mock('@/services/api/auth', () => ({
  authApi: { refresh: vi.fn(() => Promise.reject(new Error('no session'))) },
}));
vi.mock('@/services/api/system', () => ({
  getSystemInfo: vi.fn(() => new Promise(() => undefined)),
}));
vi.mock('@/services/api/meta-public', () => ({
  metaPublicApi: { deletionStatus: vi.fn() },
}));

const FULL = {
  VITE_LEGAL_COMPANY: 'Acme Fintech Pvt Ltd',
  VITE_LEGAL_ADDRESS: '1 MG Road, Jaipur 302001',
  VITE_LEGAL_EMAIL: 'privacy@acme.example',
  VITE_LEGAL_GRIEVANCE_OFFICER: 'Riya Sharma',
  VITE_LEGAL_WEBSITE: 'https://app.acme.example',
  VITE_APP_NAME: 'Acme Calls',
};
const stubAll = () => {
  for (const [k, v] of Object.entries(FULL)) vi.stubEnv(k, v);
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('markdown subset', () => {
  it('keeps https, mailto and app paths; drops everything else', () => {
    expect(safeHref('https://x.example/a')).toBe('https://x.example/a');
    expect(safeHref(' /privacy ')).toBe('/privacy');
    expect(safeHref('mailto:a@b.example')).toBe('mailto:a@b.example');
    for (const bad of [
      'javascript:alert(1)',
      'http://x.example',
      '//evil.example',
      String.raw`/\evil.example`,
      '/\n/evil.example',
      'data:x',
      '',
    ])
      expect(safeHref(bad)).toBeNull();
  });

  it('inline: text, bold, links; unsafe links stay text', () => {
    expect(parseInline('a **b** [c](/terms) [d](javascript:x) e')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', text: 'b' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'c', href: '/terms' },
      { kind: 'text', text: ' ' },
      { kind: 'text', text: 'd' },
      { kind: 'text', text: ' e' },
    ]);
    expect(parseInline('')).toEqual([]);
  });

  it('blocks: front matter, headings, paragraphs joined, lists; CRLF', () => {
    const doc = parseLegal(
      '---\r\nlastUpdated: 2026-10-26\r\nstatus: approved\r\nbad line\r\n---\r\n# T\r\n\r\nline one\r\nline two\r\n- a\r\n- b\r\nafter\r\n### Small\r\n## Mid',
    );
    expect(doc.meta).toEqual({ lastUpdated: '2026-10-26', status: 'approved' });
    expect(doc.blocks.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'list',
      'paragraph',
      'heading',
      'heading',
    ]);
    expect(doc.blocks[1]).toEqual({
      kind: 'paragraph',
      inline: [{ kind: 'text', text: 'line one line two' }],
    });
    expect(doc.blocks[2]).toMatchObject({
      kind: 'list',
      items: [[{ text: 'a' }], [{ text: 'b' }]],
    });
    expect(doc.blocks[4]).toMatchObject({ kind: 'heading', level: 3 });
    expect(parseLegal('no front matter').meta).toEqual({});
    // a list ends at an empty line or a paragraph line
    expect(parseLegal('- a\n\n- b').blocks).toHaveLength(2);
  });

  it('a paragraph before a list is closed first', () => {
    expect(parseLegal('intro\n- a').blocks.map((b) => b.kind)).toEqual(['paragraph', 'list']);
  });

  it('fills known placeholders and leaves unknown ones', () => {
    expect(fillPlaceholders('{{a}} and {{b}}', { a: 'A' })).toBe('A and {{b}}');
  });

  it('hostile content never becomes HTML', () => {
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <LegalPage
              title="X"
              source={'---\nstatus: approved\n---\n<img src=x onerror=alert(1)> **<b>hi</b>**'}
            />
          ),
        },
      ],
    });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
  });
});

describe('legal values', () => {
  it('fills from env; missing ones show as [name] and are listed', () => {
    expect(legalValues({})).toEqual({
      values: {
        company: '[company]',
        address: '[address]',
        email: '[email]',
        grievanceOfficer: '[grievanceOfficer]',
        website: '[website]',
        appName: 'Cell AI Voicebot',
      },
      missing: ['company', 'address', 'email', 'grievanceOfficer', 'website'],
    });
    expect(legalValues({ ...FULL, VITE_LEGAL_EMAIL: '  ' }).missing).toEqual(['email']);
    expect(legalValues(FULL).values.company).toBe('Acme Fintech Pvt Ltd');
  });
});

describe('legal pages (no login)', () => {
  it('privacy: every section, placeholders filled, draft banner while status is draft', async () => {
    stubAll();
    renderWithProviders({ routes: [{ path: '/', element: <PrivacyPage /> }] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    for (const name of [
      '1. Who is responsible',
      '4. Meta / WhatsApp data',
      '5. AI processing',
      '8. How long we keep data',
      '10. Your rights',
      '11. Deleting data',
    ])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    expect(screen.getAllByText(/Acme Fintech Pvt Ltd/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Riya Sharma/)).toBeInTheDocument();
    expect(screen.queryByText(/\{\{/)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Draft');
    expect(screen.getByText('Last updated: 2026-10-26')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'data deletion page' })).toHaveAttribute(
      'href',
      '/data-deletion',
    );
  });

  it('terms render; an approved text with every value has no draft banner', async () => {
    stubAll();
    renderWithProviders({ routes: [{ path: '/', element: <TermsPage /> }] });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Terms of Service' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: '3. Your contacts and consent' })).toBeVisible();
    // the shipped files are drafts until the client's legal team approves them
    expect(privacySource).toMatch(/status: (draft|approved)/);
    expect(termsSource).toMatch(/status: (draft|approved)/);
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <LegalPage title="Approved" source={'---\nstatus: approved\n---\n# Approved\nok'} />
          ),
        },
      ],
    });
    expect(await screen.findByText('ok')).toBeVisible();
    expect(screen.queryAllByRole('status')).toHaveLength(1); // only the terms page's banner
  });

  it('missing company details keep the draft banner even when approved', () => {
    renderWithProviders({
      routes: [
        { path: '/', element: <LegalPage title="T" source={'---\nstatus: approved\n---\nx'} /> },
      ],
    });
    expect(screen.getByRole('status')).toHaveTextContent('Draft');
  });

  it('contact page: details, mailto, grievance officer, links; draft when details are missing', async () => {
    stubAll();
    const view = renderWithProviders({ routes: [{ path: '/', element: <ContactPage /> }] });
    expect(await screen.findByRole('heading', { level: 1, name: 'Contact' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'privacy@acme.example' })).toHaveAttribute(
      'href',
      'mailto:privacy@acme.example',
    );
    expect(screen.getByText(/Riya Sharma/)).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
    view.unmount();
    vi.unstubAllEnvs();
    renderWithProviders({ routes: [{ path: '/', element: <ContactPage /> }] });
    expect(screen.getByRole('status')).toHaveTextContent('Draft');
    expect(screen.queryByRole('link', { name: '[email]' })).toBeNull();
  });

  it('routes are public: /privacy, /terms, /contact render signed out with the legal links', async () => {
    for (const [route, title] of [
      ['/privacy', 'Privacy Policy'],
      ['/terms', 'Terms of Service'],
      ['/contact', 'Contact'],
    ] as const) {
      const view = renderWithProviders({ route });
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeVisible();
      const nav = screen.getByRole('navigation', { name: 'Legal' });
      expect(
        within(nav)
          .getAllByRole('link')
          .map((a) => a.getAttribute('href')),
      ).toEqual(LEGAL_LINKS.map((l) => l.to));
      view.unmount();
    }
  });
});

describe('legal links elsewhere', () => {
  it('sign-in and sign-up show the legal links; sign-up names the terms and privacy policy', async () => {
    const login = renderWithProviders({ route: '/login' });
    expect(await screen.findByRole('navigation', { name: 'Legal' })).toBeVisible();
    login.unmount();
    renderWithProviders({ route: '/signup' });
    const consent = await screen.findByText(/By creating an account you agree to the/);
    expect(within(consent).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(within(consent).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('data deletion page: instructions, owner e-mail when set, the privacy link, status lookup', async () => {
    stubAll();
    vi.mocked(metaPublicApi.deletionStatus).mockResolvedValue({
      status: 'completed',
      receivedAt: '2026-10-26T10:00:00.000Z',
      completedAt: '2026-10-26T10:05:00.000Z',
    });
    const view = renderWithProviders({ route: '/data-deletion?code=ABC123' });
    expect(await screen.findByRole('heading', { name: 'How to delete your data' })).toBeVisible();
    expect(screen.getByText(/Remove the Acme Calls app in/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'privacy@acme.example' })).toBeVisible();
    expect(await screen.findByText(/completed/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
    view.unmount();
    vi.unstubAllEnvs();
    renderWithProviders({ route: '/data-deletion' });
    expect(await screen.findByText(/our support e-mail/)).toBeVisible();
  });

  it('footer links navigate to the pages', async () => {
    renderWithProviders({ route: '/login' });
    const nav = await screen.findByRole('navigation', { name: 'Legal' });
    await userEvent.click(within(nav).getByRole('link', { name: 'Terms' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Terms of Service' }),
    ).toBeVisible();
  });
});
