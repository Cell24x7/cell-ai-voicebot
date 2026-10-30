import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/services/api/errors';
import type * as InboxModule from '@/services/api/inbox';
import { inboxApi } from '@/services/api/inbox';
import { signInAs } from '@/test/auth';
import { fakeConversationDetail, fakeInboxConfig, fakeOutgoing, fakeUpload } from '@/test/inbox';
import { renderWithProviders } from '@/test/render';

import { Composer } from './Composer';
import {
  canRecord,
  fileNameFor,
  isM4a,
  micErrorMessage,
  pickVoiceType,
  VOICE_TYPES,
} from './voice-recorder';

vi.mock('@/services/api/inbox', async (importOriginal) => ({
  ...(await importOriginal<typeof InboxModule>()),
  inboxApi: { config: vi.fn(), send: vi.fn(), upload: vi.fn(), typing: vi.fn() },
}));
const api = vi.mocked(inboxApi);

let supported: string[] = [];
/** What the fake browser reports as the recorder's type ('' = like old browsers). */
let reportedType: string | null = null;
let emptyChunk = false;
/** Real browsers fire `stop` a moment after stop(). */
let asyncStop = false;

class FakeRecorder {
  static isTypeSupported = (t: string) => supported.includes(t);
  static last: FakeRecorder | null = null;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  options: { mimeType?: string } | undefined;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.options = options;
    this.mimeType = reportedType ?? options?.mimeType ?? '';
    FakeRecorder.last = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    if (this.state !== 'recording') throw new Error('InvalidStateError');
    this.state = 'inactive';
    const finish = () => {
      this.ondataavailable?.({
        data: new Blob(emptyChunk ? [] : ['opus'], { type: this.mimeType }),
      });
      this.onstop?.();
    };
    if (asyncStop) setTimeout(finish, 300);
    else finish();
  }
}

const trackStop = vi.fn();
const createUrl = vi.fn(() => 'blob:voice');
const revokeUrl = vi.fn();
const getUserMedia = vi.fn();
const stream = { getTracks: () => [{ stop: trackStop }] };

const show = () =>
  renderWithProviders({
    routes: [
      {
        path: '/',
        element: (
          <Composer
            conversation={fakeConversationDetail({
              windowExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            })}
            replyTo={null}
            onClearReply={() => undefined}
          />
        ),
      },
    ],
  });
let user: ReturnType<typeof userEvent.setup>;
const record = async () => {
  await user.click(screen.getByRole('button', { name: 'Record voice note' }));
  await screen.findByRole('timer', { name: 'Recording time' });
};
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  signInAs('agent');
  supported = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'];
  reportedType = null;
  emptyChunk = false;
  asyncStop = false;
  FakeRecorder.last = null;
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  getUserMedia.mockResolvedValue(stream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  URL.createObjectURL = createUrl;
  URL.revokeObjectURL = revokeUrl;
  api.config.mockResolvedValue(fakeInboxConfig());
  api.upload.mockImplementation(({ kind }) =>
    Promise.resolve(fakeUpload({ kind, mediaToken: 'tok-voice', voice: true })),
  );
  api.send.mockImplementation((_id, body) =>
    Promise.resolve(fakeOutgoing('accepted', { id: 'v1', clientId: body.clientId })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'mediaDevices');
  vi.clearAllMocks();
});

describe('voice recorder helpers', () => {
  it('type preference, support, file names, mic errors', () => {
    expect(VOICE_TYPES[0]).toBe('audio/ogg;codecs=opus');
    expect(pickVoiceType((t) => t.startsWith('audio/webm'))).toBe('audio/webm;codecs=opus');
    expect(pickVoiceType(() => false)).toBeNull();
    expect(canRecord()).toBe(true);
    expect(isM4a('audio/mp4')).toBe(true);
    expect(fileNameFor('audio/mp4')).toBe('voice.m4a');
    expect(fileNameFor('audio/ogg;codecs=opus')).toBe('voice.ogg');
    expect(fileNameFor('audio/webm')).toBe('voice.webm');
    const named = (name: string) => Object.assign(new Error('x'), { name });
    expect(micErrorMessage(named('NotAllowedError'))).toMatch(/blocked/);
    expect(micErrorMessage(named('SecurityError'))).toMatch(/blocked/);
    expect(micErrorMessage(named('NotFoundError'))).toBe('No microphone was found.');
    expect(micErrorMessage(named('OverconstrainedError'))).toBe('No microphone was found.');
    expect(micErrorMessage(named('NotReadableError'))).toMatch(/another app/);
    expect(micErrorMessage('weird')).toMatch(/Try again/);
  });
});

describe('recording a voice note', () => {
  it('records (mono), shows the timer, previews and sends an OGG voice note', async () => {
    show();
    await record();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    expect(FakeRecorder.last?.options).toEqual({ mimeType: 'audio/ogg;codecs=opus' });
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    await advance(3_200);
    expect(screen.getByRole('timer')).toHaveTextContent('0:03');
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(trackStop).toHaveBeenCalled();
    expect(screen.getByLabelText('Voice note preview')).toHaveAttribute('src', 'blob:voice');
    expect(screen.queryByText(/M4A/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Send voice note' }));
    await waitFor(() =>
      expect(api.send).toHaveBeenCalledWith(
        'cv1',
        expect.objectContaining({ type: 'voice', mediaToken: 'tok-voice' }),
      ),
    );
    const input = api.upload.mock.calls[0]?.[0];
    expect(input).toMatchObject({ kind: 'voice', fileName: 'voice.ogg' });
    expect(input?.durationSec).toBeGreaterThanOrEqual(3.2);
    expect(await screen.findByRole('button', { name: 'Record voice note' })).toBeInTheDocument();
  });

  it('falls back to WebM, then M4A (sent as an audio file), then the browser default', async () => {
    supported = ['audio/webm;codecs=opus'];
    show();
    await record();
    expect(FakeRecorder.last?.options).toEqual({ mimeType: 'audio/webm;codecs=opus' });
    await advance(1_500);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await user.click(screen.getByRole('button', { name: 'Re-record' }));
    expect(revokeUrl).toHaveBeenCalledWith('blob:voice');
    await screen.findByRole('timer');

    supported = ['audio/mp4'];
    await user.click(screen.getByRole('button', { name: 'Cancel recording' }));
    await record();
    await advance(1_500);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(screen.getByText(/sent as an audio file, not as a voice note/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send voice note' }));
    await waitFor(() =>
      expect(api.upload).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'voice.m4a' })),
    );
  });

  it('no preferred type: the browser picks (reported type, or WebM when it reports none)', async () => {
    supported = [];
    reportedType = '';
    emptyChunk = true;
    show();
    await record();
    expect(FakeRecorder.last?.options).toBeUndefined();
    await advance(1_200);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await user.click(screen.getByRole('button', { name: 'Send voice note' }));
    await waitFor(() =>
      expect(api.upload).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'voice.webm' })),
    );
  });

  it('a type supported but reported differently by the recorder', async () => {
    reportedType = 'audio/webm;codecs=opus';
    show();
    await record();
    await advance(1_200);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await user.click(screen.getByRole('button', { name: 'Send voice note' }));
    await waitFor(() =>
      expect(api.upload).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'voice.webm' })),
    );
  });

  it('shorter than a second is discarded; record again or close', async () => {
    show();
    await record();
    await advance(400);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(screen.getByText('Voice notes need at least 1 second.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Record again' }));
    await screen.findByRole('timer');
    await advance(300);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
  });

  it('stops by itself at the maximum length (once, even before the browser confirms)', async () => {
    asyncStop = true;
    api.config.mockResolvedValue(fakeInboxConfig({ limits: { voiceNoteMaxSeconds: 2 } }));
    show();
    await waitFor(() => expect(api.config).toHaveBeenCalled());
    await advance(10);
    await record();
    expect(screen.getByText('Recording… (up to 0 min)')).toBeInTheDocument();
    await advance(2_400);
    expect(await screen.findByRole('button', { name: 'Send voice note' })).toBeInTheDocument();
  });

  it('cancel (trash) and Esc throw the recording away and free the microphone', async () => {
    show();
    await record();
    await user.click(screen.getByRole('button', { name: 'Cancel recording' }));
    expect(trackStop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Record voice note' })).toBeInTheDocument();
    expect(createUrl).not.toHaveBeenCalled();
    await record();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Record voice note' })).toBeInTheDocument();
    // other keys do nothing
    await record();
    await user.keyboard('a');
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });

  it('cancelling the preview discards it', async () => {
    show();
    await record();
    await advance(1_500);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await user.click(screen.getByRole('button', { name: 'Cancel recording' }));
    expect(revokeUrl).toHaveBeenCalledWith('blob:voice');
    expect(screen.getByRole('button', { name: 'Record voice note' })).toBeInTheDocument();
  });

  it('waiting for permission; a late grant after cancel is released at once', async () => {
    let grant!: (s: typeof stream) => void;
    getUserMedia.mockReturnValueOnce(new Promise((r) => (grant = r)));
    show();
    await user.click(screen.getByRole('button', { name: 'Record voice note' }));
    expect(await screen.findByText('Waiting for the microphone…')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel recording' }));
    await act(async () => {
      grant(stream);
      await Promise.resolve();
    });
    expect(trackStop).toHaveBeenCalled();
    expect(FakeRecorder.last).toBeNull();
  });

  it.each([
    ['NotAllowedError', /Microphone access is blocked/],
    ['NotFoundError', /No microphone was found/],
    ['NotReadableError', /another app/],
    ['Other', /Could not start recording/],
  ])('%s → explained', async (name, text) => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('x'), { name }));
    show();
    await user.click(screen.getByRole('button', { name: 'Record voice note' }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Record voice note' })).toBeInTheDocument();
  });

  it('a browser that cannot record', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    show();
    await user.click(screen.getByRole('button', { name: 'Record voice note' }));
    expect(await screen.findByText("This browser can't record voice notes.")).toBeInTheDocument();
  });

  it('upload failure keeps the preview and says why', async () => {
    api.upload.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'WHATSAPP_MEDIA_INVALID',
        message: 'x',
        kind: 'http',
        details: [{ path: 'file', message: 'corrupt' }],
      }),
    );
    show();
    await record();
    await advance(1_500);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await user.click(screen.getByRole('button', { name: 'Send voice note' }));
    expect(await screen.findByText("This file can't be sent on WhatsApp.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send voice note' })).toBeInTheDocument();
  });

  it('leaving the chat while recording frees the microphone; after a preview too', async () => {
    const view = show();
    await record();
    view.unmount();
    expect(trackStop).toHaveBeenCalled();
    trackStop.mockClear();
    const again = show();
    await record();
    await advance(1_500);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    again.unmount();
    expect(revokeUrl).toHaveBeenCalledWith('blob:voice');
  });

  it('two starts racing (React strict mode) keep one recording; the stale microphone is released', async () => {
    let grantFirst!: (s: typeof stream) => void;
    const firstStop = vi.fn();
    getUserMedia
      .mockReturnValueOnce(new Promise((r) => (grantFirst = r)))
      .mockResolvedValueOnce(stream);
    renderWithProviders({
      routes: [
        {
          path: '/',
          element: (
            <StrictMode>
              <Composer
                conversation={fakeConversationDetail({
                  windowExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                })}
                replyTo={null}
                onClearReply={() => undefined}
              />
            </StrictMode>
          ),
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Record voice note' }));
    await screen.findByRole('timer', { name: 'Recording time' });
    await act(async () => {
      grantFirst({ getTracks: () => [{ stop: firstStop }] });
      await Promise.resolve();
    });
    expect(firstStop).toHaveBeenCalled();
    await advance(1_500);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(screen.getByLabelText('Voice note preview')).toBeInTheDocument();
    await advance(1_000);
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('upload progress while sending', async () => {
    api.upload.mockImplementationOnce(({ onProgress }) => {
      onProgress?.(45);
      return new Promise(() => undefined);
    });
    show();
    await record();
    await advance(1_500);
    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    await user.click(screen.getByRole('button', { name: 'Send voice note' }));
    expect(await screen.findByLabelText('Uploading voice note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send voice note' })).toBeDisabled();
  });
});
