import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { flowAudioApi } from '@/services/api/flow-audio';
import { pick, renderStepForm } from '@/test/inspector';

vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn() } }));
vi.mock('@/services/api/flow-audio', () => ({
  flowAudioApi: { list: vi.fn(), url: vi.fn(), upload: vi.fn() },
}));

const AUDIO = {
  id: 'au1',
  name: 'Welcome',
  format: 'wav' as const,
  bytes: 1000,
  durationMs: 2500,
  sampleRate: 8000,
  channels: 1,
  uploadedBy: null,
  createdAt: '2026-10-11T00:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(agentsApi.list).mockRejectedValue(new Error('offline'));
  vi.mocked(flowAudioApi.list).mockResolvedValue([AUDIO] as never);
});

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('basic step forms', () => {
  it('start: toggles triggers and shows errors', async () => {
    const f = renderStepForm('start', { triggers: ['test'] }, { errors: { triggers: 'Pick one' } });
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Campaign calls'));
    expect(f.last().triggers).toEqual(['test', 'campaign']);
    await userEvent.click(screen.getByLabelText('Tests (simulator, web call)'));
    expect(f.last().triggers).toEqual(['campaign']);
  });

  it('speak: text counter, long warning, language and interrupt toggle', async () => {
    const f = renderStepForm('speak', { text: 'Hi' });
    expect(screen.getByText('2 / 1000')).toBeInTheDocument();
    type('Text to say', 'x'.repeat(401));
    expect(screen.getByText('401 / 1000 — long for a phone call')).toBeInTheDocument();
    await pick('Language', 'Hindi');
    expect(f.last().language).toBe('hi');
    await userEvent.click(screen.getByLabelText('Customer can interrupt'));
    expect(f.last().interruptible).toBe(false);
  });

  it('speak: inserts a variable from the picker', async () => {
    const f = renderStepForm('speak', { text: '' });
    await userEvent.click(screen.getByRole('button', { name: /insert variable/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /\{\{amount\}\}/ }));
    expect(f.last().text).toBe('{{amount}}');
  });

  it('play audio: picks a file, plays it and sets a fallback', async () => {
    vi.mocked(flowAudioApi.url).mockResolvedValue({ url: 'https://x/a.wav' } as never);
    const play = vi.fn(() => Promise.resolve());
    vi.stubGlobal(
      'Audio',
      vi.fn(function Audio() {
        return { play };
      }),
    );
    const f = renderStepForm('play_audio', { audioId: '' });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Audio file' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Play audio' })).toBeDisabled();
    await pick('Audio file', /Welcome/);
    expect(f.last().audioId).toBe('au1');
    await userEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    await waitFor(() => expect(play).toHaveBeenCalled());
    type('Fallback text (if the file is missing)', 'Hello');
    expect(f.last().fallbackText).toBe('Hello');
    type('Fallback text (if the file is missing)', '');
    expect(f.last().fallbackText).toBeNull();
    vi.unstubAllGlobals();
  });

  it('play audio: uploads a file (error, then success) and selects it', async () => {
    vi.mocked(flowAudioApi.upload)
      .mockRejectedValueOnce(new Error('too big'))
      .mockImplementationOnce((_file, _name, onProgress) => {
        onProgress?.(50);
        return Promise.resolve({ ...AUDIO, id: 'au2', name: 'Promo' } as never);
      });
    const f = renderStepForm('play_audio', { audioId: '' });
    await userEvent.click(screen.getByRole('button', { name: 'Upload audio' }));
    let dialog = await screen.findByRole('dialog', { name: 'Upload audio' });
    expect(within(dialog).getByRole('button', { name: 'Upload' })).toBeDisabled();
    await userEvent.upload(
      within(dialog).getByLabelText('Audio file'),
      new File(['RIFF'], 'promo.wav', { type: 'audio/wav' }),
    );
    expect(within(dialog).getByLabelText('Name')).toHaveValue('promo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(flowAudioApi.upload).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog', { name: 'Upload audio' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(f.last().audioId).toBe('au2'));
    expect(vi.mocked(flowAudioApi.upload).mock.lastCall?.[1]).toBe('promo');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Upload audio' })).not.toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Upload audio' }));
    dialog = await screen.findByRole('dialog', { name: 'Upload audio' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Upload audio' })).not.toBeInTheDocument(),
    );
  });

  it('play audio: a failed play link shows an error', async () => {
    vi.mocked(flowAudioApi.url).mockRejectedValue(new Error('gone'));
    renderStepForm('play_audio', { audioId: 'au1' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play audio' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Play audio' }));
    await waitFor(() => expect(flowAudioApi.url).toHaveBeenCalledWith('au1'));
  });

  it('disposition, transfer, sms, wait and hang up', async () => {
    const d = renderStepForm('set_disposition', { disposition: 'paid' });
    await pick('Disposition', 'promise to pay');
    expect(d.last().disposition).toBe('promise_to_pay');
    type('Note (optional)', 'n');
    expect(d.last().note).toBe('n');
    type('Note (optional)', '');
    expect(d.last().note).toBeNull();
  });

  it('transfer: phone, announcement and ring time', () => {
    const f = renderStepForm(
      'transfer_to_agent',
      { phone: '' },
      { errors: { phone: 'Bad phone' } },
    );
    expect(screen.getByText('Bad phone')).toBeInTheDocument();
    type('Phone number', '+919876543210');
    expect(f.last().phone).toBe('+919876543210');
    type('Say before transferring', 'Connecting');
    type('Say before transferring', '');
    expect(f.last().announcement).toBeNull();
    type('Ring for (seconds)', '45');
    expect(f.last().timeoutSec).toBe(45);
    // emptying the number keeps the last value
    type('Ring for (seconds)', '');
    expect(f.last().timeoutSec).toBe(45);
  });

  it('sms: counts parts and DLT id', () => {
    const f = renderStepForm('send_sms', { text: '' });
    type('SMS text', 'x'.repeat(170));
    expect(screen.getByText('170 / 500 · 2 SMS')).toBeInTheDocument();
    type('DLT template id (optional)', '1107');
    expect(f.last().dltTemplateId).toBe('1107');
    type('DLT template id (optional)', '');
    expect(f.last().dltTemplateId).toBeNull();
  });

  it('whatsapp: template, language and parameters', async () => {
    const f = renderStepForm('send_whatsapp', { templateName: '', params: [] });
    type('Template name', 'EMI_Reminder');
    expect(f.last().templateName).toBe('emi_reminder');
    await pick('Template language', 'English');
    expect(f.last().language).toBe('en');
    await userEvent.click(screen.getByRole('button', { name: 'Add parameter' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add parameter' }));
    type('Parameter 2', '{{name}}');
    expect(f.last().params).toEqual(['', '{{name}}']);
    await userEvent.click(screen.getByRole('button', { name: 'Remove parameter 1' }));
    expect(f.last().params).toEqual(['{{name}}']);
  });

  it('wait: pause seconds', () => {
    const w = renderStepForm('wait', { seconds: 5 });
    type('Pause (seconds)', '9');
    expect(w.last().seconds).toBe(9);
  });

  it('hang up: goodbye line and fallback disposition', async () => {
    const f = renderStepForm('hangup', { text: 'Bye', disposition: 'paid' });
    type('Goodbye line (optional)', '');
    expect(f.last().text).toBeNull();
    await pick('Disposition if none was set', 'None');
    expect(f.last().disposition).toBeNull();
  });

  it('read-only forms hide editing controls', () => {
    renderStepForm('send_whatsapp', { templateName: 'x', params: ['a'] }, { readOnly: true });
    expect(screen.queryByRole('button', { name: 'Add parameter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove parameter 1' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Template name')).toBeDisabled();
  });
});
