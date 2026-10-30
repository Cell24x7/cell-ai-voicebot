import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentsApi } from '@/services/api/agents';
import { flowAudioApi } from '@/services/api/flow-audio';
import { sampleGraph } from '@/test/flows';
import { pick, renderStepForm } from '@/test/inspector';

vi.mock('@/services/api/agents', () => ({ agentsApi: { list: vi.fn() } }));
vi.mock('@/services/api/flow-audio', () => ({
  flowAudioApi: { list: vi.fn(), url: vi.fn(), upload: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(agentsApi.list).mockRejectedValue(new Error('offline'));
  vi.mocked(flowAudioApi.list).mockResolvedValue([]);
});

const type = (label: string | RegExp, value: string, index = 0) =>
  fireEvent.change(screen.getAllByLabelText(label)[index] as HTMLElement, { target: { value } });

const withCount = () => ({
  ...sampleGraph(),
  variables: [
    { name: 'status', type: 'text' as const },
    { name: 'tries', type: 'number' as const },
  ],
});

describe('API request', () => {
  it('method, URL with server-only tokens, headers, body, timeout and saved fields', async () => {
    const f = renderStepForm(
      'api_request',
      {
        method: 'GET',
        url: '',
        headers: [{ name: 'Authorization', secret: true, value: null, valueHint: '••••1234' }],
        saveResponse: [],
      },
      {
        errors: {
          url: 'Required',
          'headers.0.name': 'Bad name',
          bodyTemplate: 'Must be valid JSON',
        },
      },
    );
    expect(screen.getByText('Bad name')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Body/)).not.toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole('button', { name: /insert variable/i })[0] as HTMLElement,
    );
    await userEvent.click(await screen.findByRole('menuitem', { name: /\{\{contact\.phone\}\}/ }));
    expect(f.last().url).toBe('{{contact.phone}}');
    type('URL', 'https://api.example.com/loan?phone={{contact.phone}}');
    // stored secret: hint + Replace
    expect(screen.getByDisplayValue('••••1234')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replace' }));
    type('Secret value', 'Bearer abc');
    expect((f.last().headers as { value: string }[])[0]?.value).toBe('Bearer abc');
    await userEvent.click(screen.getByRole('button', { name: 'Make it a normal value' }));
    expect((f.last().headers as Record<string, unknown>[])[0]).toMatchObject({
      secret: false,
      value: '',
    });
    type('Value', 'json');
    await userEvent.click(screen.getByRole('button', { name: 'Make it secret' }));
    expect((f.last().headers as Record<string, unknown>[])[0]).toMatchObject({ secret: true });
    type('Header name', 'X-Key');
    await userEvent.click(screen.getByRole('button', { name: 'Add header' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove header 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove header X-Key' }));
    expect(f.last().headers).toEqual([]);
    await pick('Method', 'POST');
    expect(f.last().method).toBe('POST');
    expect(screen.getByText('Must be valid JSON')).toBeInTheDocument();
    type(/Body/, '{"a":1}');
    expect(f.last().bodyTemplate).toBe('{"a":1}');
    type(/Body/, ' ');
    expect(f.last().bodyTemplate).toBeNull();
    await pick('Method', 'GET');
    expect(f.last()).toMatchObject({ method: 'GET', bodyTemplate: null });
    type('Timeout (seconds)', '8');
    expect(f.last().timeoutMs).toBe(8000);
    await userEvent.click(screen.getByRole('button', { name: 'Add field to save' }));
    type('Response field', 'data.status');
    await pick('Into', 'status');
    expect(f.last().saveResponse).toEqual([{ path: 'data.status', variable: 'status' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove saved field 1' }));
    expect(f.last().saveResponse).toEqual([]);
  });

  it('read-only hides editing buttons', () => {
    renderStepForm(
      'api_request',
      {
        method: 'POST',
        url: 'https://x',
        headers: [{ name: 'A', secret: false, value: 'b' }],
        saveResponse: [{ path: 'a', variable: 'status' }],
      },
      { readOnly: true },
    );
    expect(screen.queryByRole('button', { name: 'Add header' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make it secret' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });
});

describe('condition router', () => {
  it('rules, match mode, conditions and valueless operators', async () => {
    const f = renderStepForm(
      'condition_router',
      {
        rules: [
          {
            id: 'r1',
            label: 'Paid',
            match: 'all',
            conditions: [{ variable: 'status', operator: 'equals', value: 'paid' }],
          },
        ],
      },
      { errors: { rules: 'Add at least one rule', 'rules.0.conditions.0.value': 'Required' } },
    );
    expect(screen.getByText('Add at least one rule')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
    type('Rule 1 name', 'Has paid');
    await pick('Match', 'Any condition');
    expect((f.last().rules as Record<string, unknown>[])[0]).toMatchObject({
      label: 'Has paid',
      match: 'any',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    await pick('Value of', 'amount', 1);
    await pick('Operator', 'is greater than', 1);
    type('Value', '1000', 1);
    await pick('Operator', 'is empty', 0);
    const conds = (f.last().rules as { conditions: Record<string, unknown>[] }[])[0]?.conditions;
    expect(conds).toEqual([
      { variable: 'status', operator: 'is_empty', value: null },
      { variable: 'amount', operator: 'gt', value: '1000' },
    ]);
    expect(screen.getAllByLabelText('Value')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Remove condition 2 of rule 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    const rules = f.last().rules as { id: string }[];
    expect(rules).toHaveLength(2);
    expect(rules[1]?.id).toMatch(/^[a-z0-9]+$/);
    expect(screen.getByRole('button', { name: 'Move rule 1 up' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move rule 2 up' }));
    expect((f.last().rules as { label: string }[])[1]?.label).toBe('Has paid');
    await userEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
    expect(f.last().rules).toHaveLength(1);
  });

  it('read-only hides rule editing', () => {
    renderStepForm(
      'condition_router',
      { rules: [{ id: 'r1', conditions: [{ variable: 'x', operator: 'gt', value: '1' }] }] },
      { readOnly: true },
    );
    expect(screen.queryByRole('button', { name: 'Add rule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add condition' })).not.toBeInTheDocument();
  });
});

describe('set variable', () => {
  it('assigns, increments numbers and clears', async () => {
    const f = renderStepForm(
      'set_variable',
      { assignments: [] },
      { graph: withCount(), errors: { assignments: 'Add at least one assignment' } },
    );
    expect(screen.getByText('Add at least one assignment')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add assignment' }));
    await pick('Variable', 'tries');
    await pick('Action', 'Add');
    type('Amount', '1');
    expect(f.last().assignments).toEqual([{ variable: 'tries', op: 'increment', value: '1' }]);
    // a text variable can't be incremented
    await pick('Variable', 'status');
    expect((f.last().assignments as Record<string, unknown>[])[0]).toMatchObject({ op: 'set' });
    type('Value', 'done');
    await pick('Action', 'Clear');
    expect(f.last().assignments).toEqual([{ variable: 'status', op: 'clear', value: null }]);
    expect(screen.queryByLabelText('Value')).not.toBeInTheDocument();
    await pick('Action', 'Set to');
    await userEvent.click(screen.getByRole('button', { name: 'Remove assignment 1' }));
    expect(f.last().assignments).toEqual([]);
  });

  it('no flow variables → hint; read-only hides buttons', () => {
    renderStepForm(
      'set_variable',
      { assignments: [{ variable: 'x', op: 'set', value: '1' }] },
      { graph: { ...sampleGraph(), variables: [] }, readOnly: true },
    );
    expect(screen.getByText(/Add a flow variable first/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add assignment' })).not.toBeInTheDocument();
  });
});
