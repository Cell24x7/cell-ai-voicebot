import type { InboxConfig, InboxUploadKind } from '@/services/api/types';

/** Backend `INBOX_LIMITS` (PHASE_10_PLAN §1k) — used until `/inbox/config` arrives. */
export const DEFAULT_INBOX_LIMITS = {
  textMax: 4096,
  captionMax: 1024,
  imageMaxBytes: 5 * 1024 * 1024,
  videoMaxBytes: 16 * 1024 * 1024,
  audioMaxBytes: 16 * 1024 * 1024,
  stickerMaxBytes: 100 * 1024,
  documentMaxBytes: 100 * 1024 * 1024,
  buttonsMax: 3,
  buttonTitleMax: 20,
  listRowsMax: 10,
  listSectionsMax: 10,
  rowTitleMax: 24,
  rowDescriptionMax: 72,
  headerTextMax: 60,
  footerMax: 60,
  bodyMax: 1024,
  ctaTextMax: 20,
  /** Not in `/inbox/config` (fixed by Meta). */
  listButtonMax: 20,
  sectionTitleMax: 24,
  contactsMax: 10,
  voiceNoteMaxSeconds: 600,
  voiceNoteMinMs: 1000,
  typingThrottleMs: 10_000,
};
export type InboxLimits = typeof DEFAULT_INBOX_LIMITS;

/** Server limits over the defaults (unknown keys ignored). */
export const resolveLimits = (config: InboxConfig | undefined): InboxLimits => {
  const limits = { ...DEFAULT_INBOX_LIMITS };
  for (const key of Object.keys(limits) as (keyof InboxLimits)[]) {
    const value = config?.limits[key];
    if (typeof value === 'number') limits[key] = value;
  }
  return limits;
};

/** Mime types WhatsApp accepts per upload kind (file input `accept`). */
export const UPLOAD_ACCEPT: Record<InboxUploadKind, string> = {
  image: 'image/jpeg,image/png',
  video: 'video/mp4,video/3gpp',
  audio: 'audio/aac,audio/amr,audio/mpeg,audio/mp4,audio/ogg',
  voice: 'audio/ogg,audio/webm,audio/mp4',
  document:
    'application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
  sticker: 'image/webp',
};

export const maxBytesFor = (kind: InboxUploadKind, limits: InboxLimits): number => {
  switch (kind) {
    case 'image':
      return limits.imageMaxBytes;
    case 'video':
      return limits.videoMaxBytes;
    case 'sticker':
      return limits.stickerMaxBytes;
    case 'document':
      return limits.documentMaxBytes;
    default:
      return limits.audioMaxBytes;
  }
};

const typeAllowed = (kind: InboxUploadKind, mime: string): boolean => {
  // browsers leave the type empty for unknown extensions — the server sniffs the bytes
  if (!mime) return true;
  switch (kind) {
    case 'image':
      return mime === 'image/jpeg' || mime === 'image/png';
    case 'sticker':
      return mime === 'image/webp';
    case 'video':
      return mime.startsWith('video/');
    case 'audio':
    case 'voice':
      return mime.startsWith('audio/');
    default:
      return !/^(image|video|audio)\//.test(mime);
  }
};

/** Client-side check before uploading (the server sniffs the bytes again). */
export const checkUpload = (
  file: { type: string; size: number },
  kind: InboxUploadKind,
  limits: InboxLimits,
): string | null => {
  const mime = file.type.replace(/;.*$/, '').trim().toLowerCase();
  if (!typeAllowed(kind, mime)) return "WhatsApp doesn't accept this type of file here.";
  if (file.size === 0) return 'This file is empty.';
  if (file.size > maxBytesFor(kind, limits)) return 'This file is too large for WhatsApp.';
  return null;
};
