import type { InboxInteractive, InboxSendMessage } from '@/services/api/types';

import type { InboxLimits } from '../limits';

export type InteractiveKind = 'buttons' | 'list' | 'cta_url';
export type HeaderChoice = 'none' | 'text' | 'image' | 'video' | 'document';

export interface BuilderRow {
  title: string;
  description: string;
}
export interface BuilderSection {
  title: string;
  rows: BuilderRow[];
}
export interface BuilderState {
  kind: InteractiveKind;
  /** Media headers are for buttons only (Meta). */
  headerType: HeaderChoice;
  headerText: string;
  /** Upload of the media header. */
  headerMedia: { mediaToken: string; fileName: string | null } | null;
  body: string;
  footer: string;
  buttons: string[];
  listButton: string;
  sections: BuilderSection[];
  ctaText: string;
  ctaUrl: string;
}

export const emptyBuilder = (): BuilderState => ({
  kind: 'buttons',
  headerType: 'none',
  headerText: '',
  headerMedia: null,
  body: '',
  footer: '',
  buttons: [''],
  listButton: '',
  sections: [{ title: '', rows: [{ title: '', description: '' }] }],
  ctaText: '',
  ctaUrl: '',
});

export type BuilderErrors = Partial<Record<string, string>>;

const HTTPS = /^https:\/\/[^\s]+$/i;
const len = (s: string) => s.trim().length;
const tooLong = (max: number) => `At most ${String(max)} characters`;

/** Same limits as the API (outbound.schema.ts); keys name the field (`button.0`, `row.1.0`…). */
export const validateBuilder = (s: BuilderState, l: InboxLimits): BuilderErrors => {
  const errors: BuilderErrors = {};
  const need = (key: string, value: string, max: number) => {
    if (!len(value)) errors[key] = 'Required';
    else if (len(value) > max) errors[key] = tooLong(max);
  };
  need('body', s.body, l.bodyMax);
  if (len(s.footer) > l.footerMax) errors.footer = tooLong(l.footerMax);
  const header = s.kind === 'buttons' ? s.headerType : s.headerType === 'text' ? 'text' : 'none';
  if (header === 'text') need('headerText', s.headerText, l.headerTextMax);
  if (header !== 'none' && header !== 'text' && !s.headerMedia) errors.headerMedia = 'Add a file';

  if (s.kind === 'buttons') {
    if (s.buttons.length > l.buttonsMax) errors.buttons = `At most ${String(l.buttonsMax)} buttons`;
    const seen = new Set<string>();
    s.buttons.forEach((title, i) => {
      need(`button.${String(i)}`, title, l.buttonTitleMax);
      const key = title.trim().toLowerCase();
      if (key && seen.has(key)) errors[`button.${String(i)}`] = 'Each button needs its own title';
      seen.add(key);
    });
  } else if (s.kind === 'list') {
    need('listButton', s.listButton, l.listButtonMax);
    if (s.sections.length > l.listSectionsMax)
      errors.sections = `At most ${String(l.listSectionsMax)} sections`;
    const rows = s.sections.flatMap((sec) => sec.rows).length;
    if (rows > l.listRowsMax) errors.rows = `At most ${String(l.listRowsMax)} rows in total`;
    s.sections.forEach((sec, i) => {
      if (s.sections.length > 1) need(`section.${String(i)}`, sec.title, l.sectionTitleMax);
      else if (len(sec.title) > l.sectionTitleMax)
        errors[`section.${String(i)}`] = tooLong(l.sectionTitleMax);
      sec.rows.forEach((row, j) => {
        need(`row.${String(i)}.${String(j)}`, row.title, l.rowTitleMax);
        if (len(row.description) > l.rowDescriptionMax)
          errors[`rowDescription.${String(i)}.${String(j)}`] = tooLong(l.rowDescriptionMax);
      });
    });
  } else {
    need('ctaText', s.ctaText, l.ctaTextMax);
    if (!HTTPS.test(s.ctaUrl.trim())) errors.ctaUrl = 'Must be an https:// link';
  }
  return errors;
};

const opt = (value: string) => value.trim() || null;

/** The request body (ids generated: `btn_1`, `row_1`…). */
export const toSendBody = (
  s: BuilderState,
  extra: { clientId: string; replyToMessageId?: string },
): InboxSendMessage => {
  const base = { ...extra, body: s.body.trim(), footer: opt(s.footer) };
  if (s.kind === 'buttons') {
    const header =
      s.headerType === 'text'
        ? { type: 'text' as const, text: s.headerText.trim() }
        : s.headerType !== 'none' && s.headerMedia
          ? { type: s.headerType, mediaToken: s.headerMedia.mediaToken }
          : null;
    return {
      ...base,
      type: 'buttons',
      header,
      buttons: s.buttons.map((title, i) => ({ id: `btn_${String(i + 1)}`, title: title.trim() })),
    };
  }
  const header = s.headerType === 'text' ? opt(s.headerText) : null;
  if (s.kind === 'list') {
    let n = 0;
    return {
      ...base,
      type: 'list',
      header,
      button: s.listButton.trim(),
      sections: s.sections.map((sec) => ({
        title: opt(sec.title),
        rows: sec.rows.map((row) => {
          n += 1;
          return {
            id: `row_${String(n)}`,
            title: row.title.trim(),
            description: opt(row.description),
          };
        }),
      })),
    };
  }
  return { ...base, type: 'cta_url', header, displayText: s.ctaText.trim(), url: s.ctaUrl.trim() };
};

/** Live preview in the same shape as a sent message (rendered by InteractiveContent). */
export const toPreview = (s: BuilderState): InboxInteractive => {
  const header: InboxInteractive['header'] =
    s.headerType === 'text'
      ? { type: 'text', text: s.headerText || 'Header', fileName: null }
      : s.kind === 'buttons' && s.headerType !== 'none'
        ? { type: s.headerType, text: null, fileName: s.headerMedia?.fileName ?? null }
        : null;
  return {
    kind: s.kind === 'buttons' ? 'button' : s.kind,
    header,
    body: s.body || 'Message text',
    footer: opt(s.footer),
    buttons:
      s.kind === 'buttons'
        ? s.buttons.map((title, i) => ({
            id: String(i),
            title: title || `Button ${String(i + 1)}`,
          }))
        : [],
    listButton: s.kind === 'list' ? s.listButton || 'Menu' : null,
    sections:
      s.kind === 'list'
        ? s.sections.map((sec) => ({
            title: opt(sec.title),
            rows: sec.rows.map((row, j) => ({
              id: String(j),
              title: row.title || 'Row',
              description: opt(row.description),
            })),
          }))
        : [],
    cta: s.kind === 'cta_url' ? { displayText: s.ctaText || 'Open', url: s.ctaUrl } : null,
    reply: null,
    nfmResponse: null,
    nfmTruncated: false,
    callPermission: null,
    voiceCall: null,
    requestState: null,
  };
};
