import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { fakeAudioEngine } from '@/test/calls';

import { MicError } from '../audio/engine';

import { MicCheck } from './CallSetup';
import { LiveCall } from './LiveCall';
import { INITIAL_CALL } from './useWebCall';

describe('MicCheck', () => {
  it('shows a live level until stopped; reports a refused or failing mic', async () => {
    const user = userEvent.setup();
    const audio = fakeAudioEngine();
    const { unmount } = render(<MicCheck check={() => Promise.resolve(audio.engine)} />);
    await user.click(screen.getByRole('button', { name: 'Check microphone' }));
    act(() => audio.micLevel(0.2));
    expect(screen.getByRole('progressbar', { name: 'Microphone level' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
    expect(screen.getByText(/Use headphones/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop mic check' }));
    expect(audio.calls.closed).toBe(1);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check microphone' }));
    unmount(); // closes the open check
    expect(audio.calls.closed).toBe(2);

    render(<MicCheck check={() => Promise.reject(new MicError('mic_missing'))} />);
    await user.click(screen.getByRole('button', { name: 'Check microphone' }));
    expect(screen.getByText(/No microphone found/)).toBeInTheDocument();
  });

  it('a non-mic failure says the mic could not start', async () => {
    const user = userEvent.setup();
    render(<MicCheck check={() => Promise.reject(new Error('x'))} />);
    await user.click(screen.getByRole('button', { name: 'Check microphone' }));
    expect(screen.getByText(/could not be started/)).toBeInTheDocument();
  });
});

describe('LiveCall transfer answers', () => {
  it('Answered and Failed send their result', async () => {
    const user = userEvent.setup();
    const onTransfer = vi.fn();
    const props = {
      onHangup: vi.fn(),
      onMute: vi.fn(),
      onKey: vi.fn(),
      onSay: vi.fn(),
      onTransfer,
    };
    const state = { ...INITIAL_CALL, phase: 'in_call' as const, transfer: { phoneLast4: '0000' } };
    render(<LiveCall state={state} {...props} />);
    await user.click(screen.getByRole('button', { name: 'Answered' }));
    await user.click(screen.getByRole('button', { name: 'Failed' }));
    expect(onTransfer.mock.calls).toEqual([['connected'], ['failed']]);
    expect(
      screen.queryByRole('form', { name: 'Type instead of speaking' }),
    ).not.toBeInTheDocument();
  });
});
