import type { InboxUploadKind } from '@/services/api/types';

/** Browser geolocation error codes → text (1 denied, 2 unavailable, 3 timeout, null unsupported). */
export const geoErrorMessage = (code: number | null): string => {
  switch (code) {
    case 1:
      return 'Location access is blocked. Allow it for this site, or type the coordinates.';
    case 2:
      return 'Your location is not available right now.';
    case 3:
      return 'Finding your location took too long. Try again.';
    default:
      return "This browser can't share your location.";
  }
};

/** Attach menu entries → upload kind (Photo / Video picks by the file). */
export type AttachChoice = 'media' | 'audio' | 'document' | 'sticker';
export const ATTACH_CHOICES: { value: AttachChoice; label: string }[] = [
  { value: 'media', label: 'Photo or video' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Document' },
  { value: 'sticker', label: 'Sticker' },
];

/** The upload kind of a picked / pasted file. */
export const kindFor = (choice: AttachChoice, file: { type: string }): InboxUploadKind => {
  if (choice !== 'media') return choice;
  return file.type.startsWith('video/') ? 'video' : 'image';
};

/** A pasted file: images / videos as media, audio as audio, anything else a document. */
export const kindForPaste = (file: { type: string }): InboxUploadKind => {
  if (file.type === 'image/webp') return 'sticker';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
};

/** Kinds that carry a caption on WhatsApp. */
export const hasCaption = (kind: InboxUploadKind): boolean =>
  kind === 'image' || kind === 'video' || kind === 'document';

/** Counter appears once the text is this close to the limit. */
export const showCounter = (length: number, max: number): boolean => length >= max * 0.9;
