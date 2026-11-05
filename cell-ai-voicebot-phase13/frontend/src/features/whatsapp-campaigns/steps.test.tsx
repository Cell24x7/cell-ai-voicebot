import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { contactImportsApi } from '@/services/api/contact-imports';
import { inboxApi } from '@/services/api/inbox';
import { templatesApi } from '@/services/api/templates';
import { whatsappApi } from '@/services/api/whatsapp';
import { renderWithProviders } from '@/test/render';
import { fakeTemplate } from '@/test/templates';
import { fakeChannel } from '@/test/whatsapp';
import { fakeWaEstimate } from '@/test/whatsapp-campaigns';

import './test-setup';
import { emptyDraft, toCreateInput, type WaWizardDraft } from './draft';
import {
  TemplateStep,
  VariablesStep,
  AudienceStep,
  ScheduleStep,
  NumberStep,
  ReviewStep,
  type StepProps,
} from './steps';

vi.mock('@/services/api/whatsapp-campaigns', () => ({
  waCampaignsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    estimate: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    retryFailed: vi.fn(),
    recipients: vi.fn(),
    report: vi.fn(),
    export: vi.fn(),
  },
}));
vi.mock('@/services/api/whatsapp', () => ({ whatsappApi: { channels: vi.fn() } }));
vi.mock('@/services/api/templates', () => ({ templatesApi: { list: vi.fn(), get: vi.fn() } }));
vi.mock('@/services/api/contact-lists', () => ({ contactListsApi: { list: vi.fn() } }));
vi.mock('@/services/api/segments', () => ({ segmentsApi: { list: vi.fn() } }));
vi.mock('@/services/api/custom-fields', () => ({ customFieldsApi: { list: vi.fn() } }));
vi.mock('@/services/api/contacts', () => ({
  contactsApi: { list: vi.fn(), get: vi.fn(), tags: vi.fn() },
}));
vi.mock('@/services/api/contact-imports', () => ({ contactImportsApi: { list: vi.fn() } }));

vi.mock('@/services/api/inbox', () => ({ inboxApi: { upload: vi.fn() } }));

function Harness({
  Step,
  initial = {},
}: {
  Step: React.ComponentType<StepProps>;
  initial?: Partial<WaWizardDraft>;
}) {
  const [draft, setDraft] = useState({ ...emptyDraft(), ...initial });
  return (
    <>
      <Step draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      <output aria-label="Saved input">{JSON.stringify(toCreateInput(draft))}</output>
    </>
  );
}
const saved = () =>
  JSON.parse(screen.getByLabelText('Saved input').textContent) as Record<string, unknown>;
const mount = (Step: React.ComponentType<StepProps>, initial: Partial<WaWizardDraft> = {}) =>
  renderWithProviders({
    routes: [{ path: '/', element: <Harness Step={Step} initial={initial} /> }],
  });
async function choose(label: string, option: string) {
  const select = await screen.findByRole('combobox', { name: label });
  await waitFor(() => expect(select).not.toHaveAttribute('aria-disabled', 'true'));
  fireEvent.mouseDown(select);
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

it('switches sending channels without retaining another number’s templates, variables or header', async () => {
  vi.mocked(whatsappApi.channels).mockResolvedValue({
    items: [
      fakeChannel(),
      fakeChannel({ id: 'wa2', displayPhoneNumber: '+91 90000 22222', messageRateLimit: 75 }),
    ],
  } as never);
  mount(NumberStep, {
    channelId: 'wa1',
    variants: [{ key: 'A', templateId: 't1', splitPct: 100 }],
    variables: { '1': { kind: 'static', value: 'old value' } },
    headerMediaToken: 'old-upload',
    headerLocation: { latitude: 28.6, longitude: 77.2 },
  });
  await choose('WhatsApp number', '+91 90000 22222');
  expect(saved()).toMatchObject({
    channelId: 'wa2',
    variants: [{ key: 'A', templateId: '', splitPct: 100 }],
    headerMediaToken: null,
    headerLocation: null,
  });
  expect(saved()).not.toHaveProperty('variables');
  expect(screen.getByText(/Up to 75 messages\/sec/)).toBeInTheDocument();
});

it('offers retry when sending numbers fail to load', async () => {
  vi.mocked(whatsappApi.channels).mockRejectedValueOnce(new Error('Numbers unavailable'));
  mount(NumberStep);
  const retry = await screen.findByRole('button', { name: 'Retry' });
  expect(screen.getByRole('combobox', { name: 'WhatsApp number' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  fireEvent.click(retry);
  await choose('WhatsApp number', '+91 90000 12345');
  expect(saved()).toHaveProperty('channelId', 'wa1');
});

it('blocks start while a cached wallet estimate is being refreshed', () => {
  mount(
    (props) => (
      <ReviewStep
        {...props}
        estimate={{ data: fakeWaEstimate(), isPending: false, isFetching: true, error: null }}
        canRun
        onStart={vi.fn()}
        starting={false}
        startError={null}
      />
    ),
    { channelId: 'wa1' },
  );
  expect(screen.getByRole('button', { name: 'Start campaign' })).toBeDisabled();
});

it('edits and removes A/B variants while preserving a valid split and winner settings', async () => {
  mount(TemplateStep, { channelId: 'wa1' });
  fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
  expect(saved().variants).toEqual([
    { key: 'A', templateId: '', splitPct: 50 },
    { key: 'B', templateId: '', splitPct: 50 },
  ]);
  fireEvent.change(screen.getAllByLabelText('Share %')[0]!, { target: { value: '60' } });
  expect(await screen.findByText(/splits must add up/)).toBeVisible();
  fireEvent.change(screen.getAllByLabelText('Share %')[1]!, { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: 'Most replied' }));
  fireEvent.change(screen.getByLabelText('Wait (hours)'), { target: { value: '12' } });
  expect(saved().abWinner).toEqual({ metric: 'reply', afterHours: 12 });
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
  expect(saved().variants).toEqual([{ key: 'B', templateId: '', splitPct: 100 }]);
  expect(saved().abWinner).toBeNull();
});

it('saves weekly recurrence, timezone and end date, and supports a one-off future time', async () => {
  mount(ScheduleStep);
  fireEvent.click(screen.getByRole('radio', { name: 'Recurring' }));
  await choose('Repeat', 'Weekly');
  await choose('Weekdays', 'Monday');
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  fireEvent.change(screen.getByLabelText('Recurring time'), { target: { value: '11:15' } });
  fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'UTC' } });
  fireEvent.change(screen.getByLabelText('Repeat until (optional)'), {
    target: { value: '2027-01-01T12:00' },
  });
  expect(saved().schedule).toMatchObject({
    kind: 'recurring',
    timezone: 'UTC',
    recurrence: {
      freq: 'weekly',
      days: [1],
      time: '11:15',
      until: new Date('2027-01-01T12:00').toISOString(),
    },
  });
  fireEvent.click(screen.getByRole('radio', { name: 'Later' }));
  fireEvent.change(screen.getByLabelText('Start at'), { target: { value: '2027-01-01T09:00' } });
  expect(saved().schedule).toMatchObject({
    kind: 'at',
    at: new Date('2027-01-01T09:00').toISOString(),
  });
});

it('switches audience sources without including stale selections and edits recent exclusions', async () => {
  vi.mocked(contactImportsApi.list).mockResolvedValue({
    success: true,
    data: [{ id: 'csv1', fileName: 'customers.csv', counts: { imported: 2 } }],
    meta: { page: 1, limit: 25, total: 1, totalPages: 1 },
  } as never);
  mount(AudienceStep, { listIds: ['l1'] });
  fireEvent.click(screen.getByRole('radio', { name: 'Segment' }));
  await choose('Segment', 'Overdue customers');
  expect(saved().audience).toMatchObject({ listIds: [], segmentId: 's1' });
  fireEvent.click(screen.getByRole('radio', { name: 'Tags' }));
  await choose('Tags', 'vip');
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'All of' }));
  expect(saved().audience).toMatchObject({
    segmentId: null,
    tags: { values: ['vip'], mode: 'all' },
  });
  fireEvent.change(screen.getByLabelText(/Skip if/), { target: { value: '7' } });
  expect(saved().excludeRecentDays).toBe(7);
  fireEvent.click(screen.getByRole('radio', { name: 'CSV upload' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Import' }));
  const option = await screen.findByRole('option', { name: /customers.csv/ });
  fireEvent.click(option);
  expect(saved().audience).toMatchObject({ csvUploadId: 'csv1', tags: null, listIds: [] });
  expect(screen.getByRole('link', { name: 'Upload and import contacts' })).toHaveAttribute(
    'href',
    '/contacts/import',
  );
});

it('saves template header coordinates and resets media to its approved example', async () => {
  vi.mocked(templatesApi.get).mockResolvedValue(
    fakeTemplate('APPROVED', 'UTILITY', [
      { type: 'HEADER', format: 'LOCATION' },
      { type: 'BODY', text: 'Visit us' },
    ]),
  );
  mount(VariablesStep, { variants: [{ key: 'A', templateId: 't1', splitPct: 100 }] });
  fireEvent.change(await screen.findByLabelText('Latitude'), { target: { value: '28.6' } });
  fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '77.2' } });
  expect(saved().headerLocation).toEqual({ latitude: 28.6, longitude: 77.2 });
});

it.each(['image/png', 'video/mp4', 'application/pdf'])(
  'uploads a %s campaign header and can return to the template example',
  async (mime) => {
    vi.mocked(templatesApi.get).mockResolvedValue(
      fakeTemplate('APPROVED', 'UTILITY', [
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Hello' },
      ]),
    );
    vi.mocked(inboxApi.upload).mockResolvedValue({ mediaToken: 'media1' } as never);
    mount(VariablesStep, { variants: [{ key: 'A', templateId: 't1', splitPct: 100 }] });
    const button = await screen.findByText('Upload campaign header');
    const input = button.querySelector('input')!;
    fireEvent.change(input, {
      target: { files: [new File(['fixture'], 'campaign.bin', { type: mime })] },
    });
    await screen.findByText('Campaign header uploaded');
    expect(saved().headerMediaToken).toBe('media1');
    expect(vi.mocked(inboxApi.upload).mock.calls[0]?.[0].kind).toBe(
      mime.startsWith('image') ? 'image' : mime.startsWith('video') ? 'video' : 'document',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use template example' }));
    await waitFor(() => expect(saved().headerMediaToken).toBeNull());
  },
);
