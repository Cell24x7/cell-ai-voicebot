import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { GraphAction } from '@/features/flows/graph/reducer';
import type { DraftGraph } from '@/services/api/types';
import { FAKE_FLOW_CATALOG, KNOWN_VARIABLES, sampleGraph } from '@/test/flows';
import { pick } from '@/test/inspector';
import { renderWithProviders } from '@/test/render';

import { FlowDialogs } from './FlowDialogs';

const show = (graph: DraftGraph = sampleGraph(), readOnly = false) => {
  const apply = vi.fn<(action: GraphAction) => void>();
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <FlowDialogs
            graph={graph}
            apply={apply}
            readOnly={readOnly}
            catalog={FAKE_FLOW_CATALOG}
            known={KNOWN_VARIABLES}
          />
        ),
      },
    ],
  });
  return apply;
};

const gone = () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

describe('flow dialogs', () => {
  it('read-only renders nothing', () => {
    show(sampleGraph(), true);
    expect(screen.queryByRole('button', { name: 'Flow settings' })).not.toBeInTheDocument();
  });

  it('settings: language, voice, duration, error handling with transfer phone', async () => {
    const apply = show();
    await userEvent.click(screen.getByRole('button', { name: 'Flow settings' }));
    const dialog = await screen.findByRole('dialog');
    await pick('Language', 'Hindi');
    await pick('Voice', 'alloy');
    fireEvent.change(within(dialog).getByLabelText('Longest call (minutes)'), {
      target: { value: '20' },
    });
    fireEvent.change(within(dialog).getByLabelText('If something goes wrong, say'), {
      target: { value: '' },
    });
    expect(within(dialog).getByText('Required')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('If something goes wrong, say'), {
      target: { value: 'Sorry' },
    });
    await pick('Then', 'Transfer to a person');
    expect(within(dialog).getByText(/Enter a phone number/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Transfer to phone'), {
      target: { value: '+919876543210' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(apply).toHaveBeenCalledWith({
      type: 'set_settings',
      settings: {
        language: 'hi',
        voice: 'alloy',
        maxDurationSec: 1200,
        errorMessage: 'Sorry',
        onError: 'transfer',
        errorTransferPhone: '+919876543210',
      },
    });
    await gone();
  });

  it('settings: hang up clears the transfer phone; cancel applies nothing', async () => {
    const apply = show({
      ...sampleGraph(),
      settings: { ...sampleGraph().settings, onError: 'transfer', errorTransferPhone: '+91900' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Flow settings' }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Transfer to phone'), {
      target: { value: ' ' },
    });
    await pick('Then', 'Hang up');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect((apply.mock.lastCall?.[0] as { settings: unknown }).settings).toMatchObject({
      onError: 'hangup',
      errorTransferPhone: null,
    });
    await gone();
    await userEvent.click(screen.getByRole('button', { name: 'Flow settings' }));
    dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await gone();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('variables: add, validate, rename, defaults and remove', async () => {
    const apply = show({
      ...sampleGraph(),
      variables: [
        { name: 'status', type: 'text', label: 'Status' },
        { name: 'old', type: 'number', default: 2 },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Variables (2)' }));
    const dialog = await screen.findByRole('dialog');
    const names = () => within(dialog).getAllByLabelText('Name');
    fireEvent.change(names()[0] as HTMLElement, { target: { value: 'State' } });
    expect(within(dialog).getByText(/Renamed from status/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }));
    expect(within(dialog).getByText(/Use a-z/)).toBeInTheDocument();
    fireEvent.change(names()[2] as HTMLElement, { target: { value: 'amount' } });
    expect(within(dialog).getByText(/used by a contact or system value/)).toBeInTheDocument();
    fireEvent.change(names()[2] as HTMLElement, { target: { value: 'state' } });
    expect(within(dialog).getByText('Name already used')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.change(names()[2] as HTMLElement, { target: { value: 'agreed' } });
    await pick('Type', 'boolean', 2);
    await pick('Default', 'Yes', 0);
    fireEvent.change(within(dialog).getAllByLabelText('Label')[2] as HTMLElement, {
      target: { value: 'Agreed?' },
    });
    // number default: bad text → null, number → number
    fireEvent.change(within(dialog).getAllByLabelText('Default')[1] as HTMLElement, {
      target: { value: '7' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove variable old' }));
    expect(within(dialog).getByText(/Removing old/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(apply).toHaveBeenCalledWith({
      type: 'set_variables',
      variables: [
        { name: 'state', type: 'text', label: 'Status' },
        { name: 'agreed', type: 'boolean', default: true, label: 'Agreed?' },
      ],
      renames: [{ from: 'status', to: 'state' }],
    });
    await gone();
  });

  it('variables: empty list hint, text/number/date defaults', async () => {
    const apply = show({ ...sampleGraph(), variables: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Variables (0)' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/No flow variables yet/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }));
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'note' } });
    fireEvent.change(within(dialog).getByLabelText('Default'), { target: { value: 'hi' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add variable' }));
    fireEvent.change(within(dialog).getAllByLabelText('Name')[1] as HTMLElement, {
      target: { value: 'count' },
    });
    await pick('Type', 'number', 1);
    fireEvent.change(within(dialog).getAllByLabelText('Default')[1] as HTMLElement, {
      target: { value: '' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect((apply.mock.lastCall?.[0] as { variables: unknown }).variables).toEqual([
      { name: 'note', type: 'text', default: 'hi' },
      { name: 'count', type: 'number', default: null },
    ]);
  });
});
