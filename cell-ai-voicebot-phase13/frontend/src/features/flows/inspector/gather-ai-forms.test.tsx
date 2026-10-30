import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { flowAudioApi } from '@/services/api/flow-audio';
import { fakeAgentRow } from '@/test/agents';
import { pick, renderStepForm } from '@/test/inspector';

vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn() } }));
vi.mock('@/services/api/flow-audio', () => ({
  flowAudioApi: { list: vi.fn(), url: vi.fn(), upload: vi.fn() },
}));

const agents = (rows: ReturnType<typeof fakeAgentRow>[]) =>
  vi.mocked(agentsApi.list).mockResolvedValue({
    success: true,
    data: rows,
    meta: { page: 1, limit: 100, total: rows.length, totalPages: 1 },
  });

beforeEach(() => {
  agents([fakeAgentRow()]);
  vi.mocked(flowAudioApi.list).mockResolvedValue([]);
});

const type = (label: string | RegExp, value: string, index = 0) =>
  fireEvent.change(screen.getAllByLabelText(label)[index] as HTMLElement, { target: { value } });

describe('keypad menu', () => {
  const MENU = {
    prompt: { kind: 'speak', text: 'Press 1' },
    mode: 'menu',
    keys: [
      { id: 'k1', key: '1', label: 'Yes' },
      { id: 'k2', key: '2', label: 'No' },
    ],
  };

  it('edits keys, order, repeat key, save target and retries', async () => {
    const f = renderStepForm('gather_dtmf', MENU, { errors: { keys: 'Fix keys' } });
    expect(screen.getByText('Fix keys')).toBeInTheDocument();
    type('Prompt', 'Dabaiye');
    expect(f.last().prompt).toEqual({ kind: 'speak', text: 'Dabaiye' });
    type('Meaning', 'Haan', 0);
    expect((f.last().keys as { label: string }[])[0]?.label).toBe('Haan');
    fireEvent.change(screen.getAllByLabelText('Key')[1] as HTMLElement, { target: { value: '1' } });
    expect(screen.getByText('Each key can be used once.')).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText('Key')[1] as HTMLElement, { target: { value: '3' } });
    await userEvent.click(screen.getByRole('button', { name: 'Move key 2 up' }));
    expect((f.last().keys as { key: string }[]).map((k) => k.key)).toEqual(['3', '1']);
    expect(screen.getByRole('button', { name: 'Move key 1 up' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Add key' }));
    const keys = f.last().keys as { id: string; key: string }[];
    expect(keys).toHaveLength(3);
    expect(keys[2]?.key).toBe('2');
    expect(keys[2]?.id).toMatch(/^[a-z0-9]+$/);
    await userEvent.click(screen.getByRole('button', { name: 'Remove key 2' }));
    expect(f.last().keys).toHaveLength(2);
    await pick('Repeat the question with', '9');
    expect(f.last().repeatKey).toBe('9');
    await pick('Repeat the question with', 'No repeat key');
    expect(f.last().repeatKey).toBeNull();
    await pick('Save the key(s) in', 'status (text)');
    expect(f.last().saveAs).toBe('status');
    await pick('Save the key(s) in', /Don.t save/);
    expect(f.last().saveAs).toBeNull();
    type('Wait (seconds)', '10');
    type('Retries', '3');
    type('When nothing is heard', 'Kuch suna nahi');
    type('When the answer is not valid', 'Galat');
    expect(f.last()).toMatchObject({
      timeoutSec: 10,
      maxRetries: 3,
      noInputText: 'Kuch suna nahi',
      invalidText: 'Galat',
    });
  });

  it('switches to digits mode and to an audio prompt', async () => {
    const f = renderStepForm('gather_dtmf', MENU);
    await userEvent.click(screen.getByRole('button', { name: 'Collect digits' }));
    expect(f.last().mode).toBe('digits');
    type('Min digits', '2');
    type('Max digits', '6');
    await pick('Finish key', /None/);
    expect(f.last()).toMatchObject({ minDigits: 2, maxDigits: 6, finishKey: 'none' });
    await userEvent.click(screen.getByRole('button', { name: 'Audio file' }));
    expect(f.last().prompt).toEqual({ kind: 'audio', audioId: '', fallbackText: null });
    type('Fallback text (if the file is missing)', 'Hello');
    expect(f.last().prompt).toMatchObject({ kind: 'audio', fallbackText: 'Hello' });
    type('Fallback text (if the file is missing)', '');
    expect(f.last().prompt).toMatchObject({ fallbackText: null });
    await userEvent.click(screen.getByRole('button', { name: 'Text' }));
    expect(f.last().prompt).toEqual({ kind: 'speak', text: '' });
    await userEvent.click(screen.getByRole('button', { name: 'Menu keys' }));
    expect(f.last().mode).toBe('menu');
  });

  it('read-only hides key editing', () => {
    renderStepForm('gather_dtmf', MENU, { readOnly: true });
    expect(screen.queryByRole('button', { name: 'Add key' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove key 1' })).not.toBeInTheDocument();
  });

  it('a full key list hides "Add key"', () => {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'].map((key) => ({
      id: `k${key === '*' ? 's' : key === '#' ? 'h' : key}`,
      key,
      label: '',
    }));
    renderStepForm('gather_dtmf', { mode: 'menu', keys, prompt: { kind: 'speak', text: '' } });
    expect(screen.queryByRole('button', { name: 'Add key' })).not.toBeInTheDocument();
  });
});

describe('listen (speech)', () => {
  it('edits intents, keywords, order, match mode and language', async () => {
    const f = renderStepForm(
      'gather_speech',
      {
        prompt: { kind: 'speak', text: 'Boliye' },
        intents: [{ id: 'i1', label: 'Paid', keywords: ['paid'] }],
      },
      { errors: { 'intents.0.keywords': 'Add a keyword' } },
    );
    expect(screen.getByText('Add a keyword')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add intent' }));
    type('Intent', 'Later', 1);
    const kw = screen.getAllByLabelText('Keywords')[1] as HTMLElement;
    await userEvent.type(kw, 'baad mein{Enter}kal{Enter}');
    expect((f.last().intents as { keywords: string[] }[])[1]?.keywords).toEqual([
      'baad mein',
      'kal',
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Move intent 1 down' }));
    expect((f.last().intents as { label: string }[]).map((i) => i.label)).toEqual([
      'Later',
      'Paid',
    ]);
    expect(screen.getByRole('button', { name: 'Move intent 2 down' })).toBeDisabled();
    await pick('Match intents by', /AI/);
    expect(f.last().matchMode).toBe('ai');
    await pick('Language', 'Auto-detect');
    expect(f.last().language).toBe('auto');
    await pick('Save the answer in', 'status (text)');
    expect(f.last().saveAs).toBe('status');
    await userEvent.click(screen.getByRole('button', { name: 'Remove intent Paid' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove intent Later' }));
    expect(f.last().intents).toEqual([]);
    expect(screen.queryByRole('combobox', { name: 'Match intents by' })).not.toBeInTheDocument();
  });

  it('read-only hides intent editing', () => {
    renderStepForm(
      'gather_speech',
      { intents: [{ id: 'i1', label: '', keywords: [] }] },
      { readOnly: true },
    );
    expect(screen.queryByRole('button', { name: 'Add intent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove intent/ })).not.toBeInTheDocument();
  });
});

describe('AI agent', () => {
  it('picks an agent, goal, shared values, turns and opening line', async () => {
    agents([fakeAgentRow(), fakeAgentRow({ id: 'a2', name: 'Old Bot', isActive: false })]);
    const f = renderStepForm('ai_agent', { agentId: '' });
    await userEvent.click(screen.getByRole('combobox', { name: 'AI agent' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Old Bot (inactive)' }));
    expect(f.last().agentId).toBe('a2');
    expect(screen.getByText(/This agent is inactive/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open agent' })).toHaveAttribute('href', '/agents/a2');
    await pick('AI agent', 'Recovery Bot');
    expect(screen.queryByText(/This agent is inactive/)).not.toBeInTheDocument();
    type('Goal for this step', 'Get a date');
    expect(f.last().goal).toBe('Get a date');
    await userEvent.click(screen.getByLabelText('Share these values with the agent'));
    await userEvent.click(
      within(screen.getByRole('listbox')).getByRole('option', { name: 'amount' }),
    );
    expect(f.last().passVariables).toEqual(['amount']);
    type('Max turns', '12');
    expect(f.last().maxTurns).toBe(12);
    await userEvent.click(screen.getByLabelText('Agent speaks its opening line'));
    expect(f.last().speakOpeningLine).toBe(false);
  });

  it('unknown agent, empty list and load errors', async () => {
    agents([]);
    renderStepForm('ai_agent', { agentId: 'gone' });
    expect(await screen.findByText(/No AI agents yet/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'AI agent' })).toHaveTextContent('Unknown agent');
  });

  it('shows a warning when agents cannot load', async () => {
    vi.mocked(agentsApi.list).mockRejectedValue(new Error('offline'));
    renderStepForm(
      'ai_agent',
      {},
      { graph: { ...(await import('@/test/flows')).sampleGraph(), variables: [] } },
    );
    expect(await screen.findByText('Couldn’t load your AI agents.')).toBeInTheDocument();
  });
});
