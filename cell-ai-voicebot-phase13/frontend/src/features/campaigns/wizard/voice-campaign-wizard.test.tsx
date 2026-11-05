import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewCampaignDialog } from '@/features/campaigns/NewCampaignDialog';
import { phoneNumbersApi } from '@/services/api/phone-numbers';
import { signInAs } from '@/test/auth';

import { BasicsStep } from './BasicsStep';
import { emptyDraft, previewBody, stepProblems, toCreateInput, type WizardDraft } from './draft';

vi.mock('@/features/flows/queries', () => ({
  useFlows: () => ({ data: { data: [] }, isPending: false, isSuccess: true }),
  useFlowVersions: () => ({ data: [] }),
  useFlowAudio: () => ({ data: [{ id: 'au1', name: 'Reminder', durationMs: 24_000 }] }),
}));
vi.mock('@/features/flows/inspector/AudioPicker', () => ({
  AudioPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange('au1')}>
      Pick Reminder
    </button>
  ),
}));
vi.mock('@/services/api/phone-numbers', async (original) => ({
  ...(await original<object>()),
  phoneNumbersApi: { line: vi.fn() },
}));

const ACCOUNT = { timezone: 'Asia/Kolkata', window: { start: '09:00', end: '19:00', days: [1] } };
const seen: { draft: WizardDraft | null } = { draft: null };

function Harness() {
  const [draft, setDraft] = useState<WizardDraft>(emptyDraft(ACCOUNT));
  return (
    <BasicsStep
      draft={draft}
      lock="none"
      onChange={(p) => {
        const next = { ...draft, ...p };
        seen.draft = next;
        setDraft(next);
      }}
    />
  );
}
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  vi.clearAllMocks();
  seen.draft = null;
});

describe('recorded-voice campaigns (Cell24x7)', () => {
  it('offers recorded voice when enabled and saves only voice settings', async () => {
    signInAs('owner');
    vi.mocked(phoneNumbersApi.line).mockResolvedValue({
      line: 'dryrun',
      numbers: [],
      voiceApi: { enabled: true },
    });
    render(
      <QueryClientProvider client={client()}>
        <Harness />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /Recorded voice or IVR/ }));
    expect(screen.queryByRole('radio', { name: 'Live calls' })).not.toBeInTheDocument();
    const draft = { ...seen.draft!, name: 'Reminder run' };
    expect(stepProblems(0, draft)).toEqual(['Choose or upload the audio']);
    await user.click(screen.getByRole('button', { name: 'Pick Reminder' }));
    const ready = { ...seen.draft!, name: 'Reminder run', listIds: ['l1'] };
    expect(stepProblems(0, ready)).toEqual([]);
    expect(stepProblems(3, { ...ready, voice: { ...ready.voice, retries: 4 } })).toEqual([
      'Redials: 0 to 3',
    ]);
    const body = toCreateInput(ready);
    expect(body).toMatchObject({
      name: 'Reminder run',
      mode: 'live',
      line: 'voice_api',
      voiceApi: {
        content: { kind: 'audio', flowAudioId: 'au1' },
        retries: 0,
        retryIntervalMin: 30,
      },
    });
    expect(body).not.toHaveProperty('flowId');
    expect(body).not.toHaveProperty('dryRun');
    expect(previewBody(ready)?.line).toBe('voice_api');
  });

  it('hides recorded voice when the account does not have it', async () => {
    signInAs('owner');
    vi.mocked(phoneNumbersApi.line).mockResolvedValue({ line: 'sip', numbers: [] });
    render(
      <QueryClientProvider client={client()}>
        <Harness />
      </QueryClientProvider>,
    );
    await screen.findByRole('radio', { name: 'Live calls' });
    expect(screen.queryByRole('radio', { name: /Recorded voice or IVR/ })).not.toBeInTheDocument();
  });

  it('New campaign shows the three types; bulk needs the WhatsApp campaign role', () => {
    signInAs('owner');
    const { unmount } = render(
      <MemoryRouter>
        <NewCampaignDialog open onClose={() => undefined} />
      </MemoryRouter>,
    );
    for (const name of ['SIP / Normal call', 'WhatsApp call', 'WhatsApp bulk message']) {
      expect(screen.getByRole('button', { name })).toBeEnabled();
    }
    unmount();
    signInAs('viewer');
    render(
      <MemoryRouter>
        <NewCampaignDialog open onClose={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'WhatsApp bulk message' })).toBeDisabled();
  });
});
