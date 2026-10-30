import AttachFileOutlined from '@mui/icons-material/AttachFileOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import ContactPhoneOutlined from '@mui/icons-material/ContactPhoneOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import EmojiEmotionsOutlined from '@mui/icons-material/EmojiEmotionsOutlined';
import MicOutlined from '@mui/icons-material/MicOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import SendOutlined from '@mui/icons-material/SendOutlined';
import SmartButtonOutlined from '@mui/icons-material/SmartButtonOutlined';
import StickyNote2Outlined from '@mui/icons-material/StickyNote2Outlined';
import ViewQuiltOutlined from '@mui/icons-material/ViewQuiltOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link as RouterLink } from 'react-router';

import { usePermission } from '@/features/auth/hooks';
import { usePricePreview } from '@/features/templates/queries';
import type { SendContact } from '@/features/templates/send/resolve';
import { toApiError } from '@/services/api/errors';
import type {
  InboxConversationDetail,
  InboxMessage,
  InboxSendMessage,
  InboxUploadKind,
} from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import { formatBytes, windowState } from '../format';
import { useNow, useOnline } from '../hooks';
import { inboxErrorMessage, READ_ONLY_TEXT, WINDOW_CLOSED_TEXT } from '../labels';
import { checkUpload, UPLOAD_ACCEPT } from '../limits';
import { channelCanReply } from '../permissions';
import {
  useCanReply,
  useContactPanel,
  useInboxLimits,
  useSendMessage,
  useTypingPing,
  useUploadMedia,
} from '../queries';

import { readDraft, saveDraft } from './drafts';
import {
  ATTACH_CHOICES,
  hasCaption,
  kindFor,
  kindForPaste,
  showCounter,
  type AttachChoice,
} from './helpers';
import { toSendBody, type BuilderState } from './interactive';
import type { LocationInput } from './LocationDialog';
import { fileNameFor } from './voice-recorder';
import type { RecordedVoice } from './VoiceRecorder';

const EmojiPicker = lazy(() => import('./EmojiPicker').then((m) => ({ default: m.EmojiPicker })));
const VoiceRecorder = lazy(() =>
  import('./VoiceRecorder').then((m) => ({ default: m.VoiceRecorder })),
);
const LocationDialog = lazy(() =>
  import('./LocationDialog').then((m) => ({ default: m.LocationDialog })),
);
const ContactCardDialog = lazy(() =>
  import('./ContactCardDialog').then((m) => ({ default: m.ContactCardDialog })),
);
const InteractiveBuilder = lazy(() =>
  import('./InteractiveBuilder').then((m) => ({ default: m.InteractiveBuilder })),
);
const SendTemplateDialog = lazy(() =>
  import('@/features/templates/send/SendTemplateDialog').then((m) => ({
    default: m.SendTemplateDialog,
  })),
);

interface Attachment {
  file: File;
  kind: InboxUploadKind;
  /** Object URL for a photo / video preview (revoked when done). */
  previewUrl: string | null;
  caption: string;
}

type DialogName = 'location' | 'contacts' | 'interactive' | 'template';

const Banner = ({
  children,
  severity = 'info',
}: {
  children: ReactNode;
  severity?: 'info' | 'warning';
}) => (
  <Alert severity={severity} sx={{ borderRadius: 0 }}>
    {children}
  </Alert>
);

/**
 * Reply box: text (Enter sends, Shift+Enter new line), emoji, attachments with
 * caption / progress / cancel, voice note, location, contact cards, interactive
 * messages, reply-to, internal notes; replaced by a banner when the window is
 * closed (notes still allowed), the customer is blocked, the number cannot send
 * or the user may only read.
 */
export function Composer({
  conversation: c,
  replyTo,
  onClearReply,
}: {
  conversation: InboxConversationDetail;
  replyTo: InboxMessage | null;
  onClearReply: () => void;
}) {
  const allowed = useCanReply();
  const limits = useInboxLimits();
  const send = useSendMessage(c.id);
  const upload = useUploadMedia();
  const ping = useTypingPing(c.id);
  const online = useOnline();
  const now = useNow();
  const [text, setText] = useState(() => readDraft(c.id));
  const [note, setNote] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [recording, setRecording] = useState(false);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [attachAnchor, setAttachAnchor] = useState<HTMLElement | null>(null);
  const [choice, setChoice] = useState<AttachChoice>('media');
  const fileInput = useRef<HTMLInputElement>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const canTemplates = usePermission('templates.read');
  const panel = useContactPanel(c.id);
  const windowIsOpen = windowState(c.windowExpiresAt, now).open;
  // what a service reply may cost (platform payers; free inside the monthly free tier)
  const replyPrice = usePricePreview(
    allowed && c.channel && windowIsOpen
      ? { channelId: c.channel.id, contactId: c.contact.id, category: 'service' }
      : null,
  );

  // object URLs of previews are freed when replaced / sent / unmounted
  const preview = attachment?.previewUrl ?? null;
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  if (!allowed) {
    return (
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}
      >
        {READ_ONLY_TEXT}
      </Typography>
    );
  }
  if (c.blocked) {
    return <Banner severity="warning">You blocked this customer. Unblock them to reply.</Banner>;
  }
  if (!channelCanReply(c.channel)) {
    return (
      <Banner severity="warning">
        This WhatsApp number isn&apos;t ready to send messages.{' '}
        <Link component={RouterLink} to="/whatsapp/numbers">
          Open Numbers
        </Link>
      </Banner>
    );
  }
  const contact: SendContact = panel.data?.contact ?? {
    id: c.contact.id,
    name: c.contact.name,
    phoneE164: c.contact.phoneE164,
    email: null,
    variables: {},
    dnd: false,
    optedOutAt: null,
  };
  const templateDialog = dialog === 'template' && c.channel && (
    <Suspense fallback={null}>
      <SendTemplateDialog
        open
        channelId={c.channel.id}
        contact={contact}
        target={{ kind: 'conversation', conversationId: c.id }}
        onClose={() => setDialog(null)}
      />
    </Suspense>
  );
  const windowOpen = windowIsOpen;
  if (!windowOpen && !note) {
    return (
      <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
        <Banner>{WINDOW_CLOSED_TEXT}</Banner>
        <Stack direction="row" spacing={1} sx={{ px: 2, py: 1, flexWrap: 'wrap' }}>
          {canTemplates && (
            <Button
              size="small"
              variant="contained"
              startIcon={<ViewQuiltOutlined />}
              onClick={() => setDialog('template')}
            >
              Send a template
            </Button>
          )}
          <Button size="small" startIcon={<StickyNote2Outlined />} onClick={() => setNote(true)}>
            Write an internal note
          </Button>
        </Stack>
        {templateDialog}
      </Box>
    );
  }

  const reply = replyTo && !note ? { replyToMessageId: replyTo.id } : {};
  const fail = (e: unknown) => {
    const apiError = toApiError(e);
    if (apiError.kind !== 'canceled') setError(inboxErrorMessage(apiError));
  };
  const dispatch = (body: InboxSendMessage) => {
    setError(null);
    send.mutate(body, { onError: fail });
    onClearReply();
  };
  const id = () => crypto.randomUUID();

  const sendText = () => {
    const value = text.trim();
    if (!value || !online) return;
    dispatch(
      note
        ? { clientId: id(), type: 'note', text: value }
        : { clientId: id(), type: 'text', text: value, ...reply },
    );
    setText('');
    saveDraft(c.id, '');
  };

  const pickFile = (file: File, kind: InboxUploadKind) => {
    const problem = checkUpload(file, kind, limits);
    setError(problem);
    if (problem) return;
    setAttachment({
      file,
      kind,
      previewUrl: kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : null,
      caption: '',
    });
  };

  const sendAttachment = async (a: Attachment) => {
    setError(null);
    try {
      const done = await upload.mutateAsync({ file: a.file, fileName: a.file.name, kind: a.kind });
      const caption = a.caption.trim() || null;
      const base = { clientId: id(), mediaToken: done.mediaToken, ...reply };
      dispatch(
        a.kind === 'image' || a.kind === 'video'
          ? { ...base, type: a.kind, caption }
          : a.kind === 'document'
            ? { ...base, type: 'document', caption, fileName: a.file.name }
            : { ...base, type: a.kind === 'sticker' ? 'sticker' : 'audio' },
      );
      setAttachment(null);
    } catch (e) {
      fail(e);
    }
  };

  const sendVoice = async (voice: RecordedVoice) => {
    setError(null);
    try {
      const done = await upload.mutateAsync({
        file: voice.blob,
        fileName: fileNameFor(voice.mimeType),
        kind: 'voice',
        durationSec: voice.durationSec,
      });
      dispatch({ clientId: id(), type: 'voice', mediaToken: done.mediaToken, ...reply });
      setRecording(false);
    } catch (e) {
      fail(e);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendText();
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLElement>) => {
    const file = e.clipboardData.files[0];
    if (!file || note) return;
    e.preventDefault();
    pickFile(file, kindForPaste(file));
  };
  const insertEmoji = (emoji: string) => {
    // the text box is on screen whenever the emoji button is
    const el = textBox.current as HTMLTextAreaElement;
    const next = text.slice(0, el.selectionStart) + emoji + text.slice(el.selectionEnd);
    setText(next);
    saveDraft(c.id, next);
    setEmojiAnchor(null);
  };

  const optedOut = c.contact.optedOut;
  const tools = !note && !attachment;
  return (
    <Box
      sx={(theme) => ({
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: note ? alpha(theme.palette.warning.main, 0.12) : 'background.paper',
      })}
    >
      {optedOut && !note && <Banner>This customer opted out — replies only</Banner>}
      {!windowOpen && note && <Banner>{WINDOW_CLOSED_TEXT}</Banner>}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      )}
      {replyTo && !note && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ px: 2, pt: 1, alignItems: 'center' }}
          aria-label="Replying to"
        >
          <Box sx={{ flex: 1, minWidth: 0, borderLeft: 3, borderColor: 'success.main', pl: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Replying to {replyTo.direction === 'out' ? 'your message' : 'the customer'}
            </Typography>
            <Typography variant="body2" noWrap>
              {replyTo.text ?? replyTo.type}
            </Typography>
          </Box>
          <IconButton size="small" aria-label="Cancel reply" onClick={onClearReply}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Stack>
      )}

      {attachment && (
        <Stack spacing={1} sx={{ px: 2, pt: 1 }} aria-label="Attachment">
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            {attachment.kind === 'image' && attachment.previewUrl ? (
              <Box
                component="img"
                src={attachment.previewUrl}
                alt="Attachment preview"
                sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 1 }}
              />
            ) : attachment.kind === 'video' && attachment.previewUrl ? (
              <Box
                component="video"
                src={attachment.previewUrl}
                aria-label="Attachment preview"
                sx={{ width: 96, height: 64, borderRadius: 1 }}
              />
            ) : (
              <DescriptionOutlined color="action" />
            )}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" noWrap>
                {attachment.file.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatBytes(attachment.file.size)}
              </Typography>
            </Box>
            <Button
              size="small"
              onClick={() => {
                upload.cancel();
                setAttachment(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={upload.isPending || !online}
              onClick={() => void sendAttachment(attachment)}
            >
              Send
            </Button>
          </Stack>
          {hasCaption(attachment.kind) && (
            <TextField
              size="small"
              label="Caption (optional)"
              value={attachment.caption}
              onChange={(e) => setAttachment({ ...attachment, caption: e.target.value })}
              slotProps={{ htmlInput: { maxLength: limits.captionMax } }}
            />
          )}
          {upload.isPending && (
            <LinearProgress
              variant="determinate"
              value={upload.progress}
              aria-label="Upload progress"
            />
          )}
        </Stack>
      )}

      {recording ? (
        <Box sx={{ px: 2, py: 1 }}>
          <Suspense fallback={null}>
            <VoiceRecorder
              maxSeconds={limits.voiceNoteMaxSeconds}
              minMs={limits.voiceNoteMinMs}
              uploading={upload.isPending}
              progress={upload.progress}
              onSend={(v) => void sendVoice(v)}
              onClose={() => setRecording(false)}
            />
          </Suspense>
        </Box>
      ) : (
        <Box sx={{ px: 1, py: 1 }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <IconButton aria-label="Emoji" onClick={(e) => setEmojiAnchor(e.currentTarget)}>
              <EmojiEmotionsOutlined />
            </IconButton>
            {tools && (
              <>
                <IconButton aria-label="Attach" onClick={(e) => setAttachAnchor(e.currentTarget)}>
                  <AttachFileOutlined />
                </IconButton>
                <IconButton aria-label="Location" onClick={() => setDialog('location')}>
                  <PlaceOutlined />
                </IconButton>
                <IconButton aria-label="Contact card" onClick={() => setDialog('contacts')}>
                  <ContactPhoneOutlined />
                </IconButton>
                <IconButton
                  aria-label="Interactive message"
                  onClick={() => setDialog('interactive')}
                >
                  <SmartButtonOutlined />
                </IconButton>
                {canTemplates && (
                  <IconButton aria-label="Templates" onClick={() => setDialog('template')}>
                    <ViewQuiltOutlined />
                  </IconButton>
                )}
              </>
            )}
            <Box sx={{ flex: 1 }} />
            <Tooltip title={note ? 'Back to a WhatsApp reply' : 'Write an internal note'}>
              <ToggleButton
                value="note"
                size="small"
                selected={note}
                aria-label="Internal note"
                onChange={() => setNote(!note)}
                sx={{ border: 0 }}
              >
                <StickyNote2Outlined />
              </ToggleButton>
            </Tooltip>
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-end', mt: 0.5 }}>
            <InputBase
              inputRef={textBox}
              multiline
              maxRows={6}
              placeholder={note ? 'Internal note — only your team sees this' : 'Type a message'}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                saveDraft(c.id, e.target.value);
                if (!note && e.target.value) ping();
              }}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              inputProps={{ 'aria-label': 'Message', maxLength: limits.textMax }}
              sx={{ flex: 1, px: 1.5, py: 1, borderRadius: 2, bgcolor: 'action.hover' }}
            />
            {!text.trim() && tools ? (
              <IconButton
                aria-label="Record voice note"
                disabled={!online}
                onClick={() => setRecording(true)}
              >
                <MicOutlined />
              </IconButton>
            ) : (
              <IconButton
                aria-label="Send"
                color="success"
                disabled={!text.trim() || !online}
                onClick={sendText}
              >
                <SendOutlined />
              </IconButton>
            )}
          </Stack>
        </Box>
      )}
      {!note && replyPrice.data?.payer === 'platform' && replyPrice.data.priceMicros > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ px: 2, pb: 0.5, display: 'block' }}
        >
          Replies may cost {formatCurrencyMicros(replyPrice.data.priceMicros)} after the free 1,000
          each month
        </Typography>
      )}
      {(showCounter(text.length, limits.textMax) || !online) && (
        <Typography
          variant="caption"
          color={online ? 'text.secondary' : 'error'}
          sx={{ px: 2, pb: 1, display: 'block', textAlign: 'right' }}
        >
          {online
            ? `${String(text.length)} / ${String(limits.textMax)}`
            : "You're offline. Messages can't be sent."}
        </Typography>
      )}

      <input
        ref={fileInput}
        hidden
        type="file"
        aria-label="Choose a file"
        accept={
          choice === 'media'
            ? `${UPLOAD_ACCEPT.image},${UPLOAD_ACCEPT.video}`
            : UPLOAD_ACCEPT[choice]
        }
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) pickFile(file, kindFor(choice, file));
        }}
      />
      <Menu
        anchorEl={attachAnchor}
        open={Boolean(attachAnchor)}
        onClose={() => setAttachAnchor(null)}
      >
        {ATTACH_CHOICES.map((a) => (
          <MenuItem
            key={a.value}
            onClick={() => {
              setChoice(a.value);
              setAttachAnchor(null);
              // the input's accept follows the choice before it opens
              setTimeout(() => (fileInput.current as HTMLInputElement).click(), 0);
            }}
          >
            {a.label}
          </MenuItem>
        ))}
      </Menu>
      <Popover
        open={Boolean(emojiAnchor)}
        anchorEl={emojiAnchor}
        onClose={() => setEmojiAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Suspense fallback={<Box sx={{ p: 2 }}>Loading…</Box>}>
          <EmojiPicker onPick={insertEmoji} />
        </Suspense>
      </Popover>
      <Suspense fallback={null}>
        {dialog === 'location' && (
          <LocationDialog
            onClose={() => setDialog(null)}
            onSend={(loc: LocationInput) => {
              setDialog(null);
              dispatch({ clientId: id(), type: 'location', ...loc, ...reply });
            }}
          />
        )}
        {dialog === 'contacts' && (
          <ContactCardDialog
            max={limits.contactsMax}
            onClose={() => setDialog(null)}
            onSend={(contactIds) => {
              setDialog(null);
              dispatch({ clientId: id(), type: 'contacts', contactIds, ...reply });
            }}
          />
        )}
        {templateDialog}
        {dialog === 'interactive' && (
          <InteractiveBuilder
            limits={limits}
            onClose={() => setDialog(null)}
            onSend={(state: BuilderState) => {
              setDialog(null);
              dispatch(toSendBody(state, { clientId: id(), ...reply }));
            }}
          />
        )}
      </Suspense>
    </Box>
  );
}
