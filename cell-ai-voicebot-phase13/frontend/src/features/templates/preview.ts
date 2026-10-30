import type { WhatsAppParameterFormat, WhatsAppTemplateComponent } from '@/services/api/types';

import { TEMPLATE_LIMITS } from './limits';
import {
  componentOf,
  copyCodeKey,
  headerKey,
  placeholdersIn,
  renderText,
  urlButtonKey,
} from './variables';

export type PreviewHeader =
  | { kind: 'text'; text: string }
  | { kind: 'image' | 'video' | 'document'; fileName: string | null }
  | { kind: 'location'; name: string | null };

export interface PreviewButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'VOICE_CALL' | 'OTHER';
  text: string;
  /** URL buttons: the address with the suffix filled in. */
  url?: string;
}

/** What the WhatsApp-like bubble shows. */
export interface TemplatePreview {
  header: PreviewHeader | null;
  body: string;
  footer: string | null;
  buttons: PreviewButton[];
  /** Phones show 3 buttons and "See all options" for the rest. */
  hiddenButtons: number;
  callPermission: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

const BUTTON_FALLBACK: Record<string, string> = {
  COPY_CODE: 'Copy code',
  VOICE_CALL: 'Call on WhatsApp',
};

export interface PreviewOptions {
  /** Values per variable key (samples or real values); missing → `{{n}}` stays. */
  values?: Readonly<Record<string, string>>;
  /** Header media file / location name shown in the bubble. */
  headerFileName?: string | null;
  locationName?: string | null;
}

/** Template components (Meta JSON) → the bubble model. */
export const buildPreview = (
  components: readonly Record<string, unknown>[] | readonly WhatsAppTemplateComponent[],
  format: WhatsAppParameterFormat,
  { values = {}, headerFileName = null, locationName = null }: PreviewOptions = {},
): TemplatePreview => {
  const header = componentOf(components, 'HEADER');
  const headerFormat = str(header?.format).toUpperCase();
  let previewHeader: PreviewHeader | null = null;
  if (header && headerFormat === 'TEXT')
    previewHeader = {
      kind: 'text',
      text: renderText(str(header.text), values, (raw) => headerKey(raw, format)),
    };
  else if (headerFormat === 'IMAGE' || headerFormat === 'VIDEO' || headerFormat === 'DOCUMENT')
    previewHeader = {
      kind: headerFormat.toLowerCase() as 'image' | 'video' | 'document',
      fileName: headerFileName,
    };
  else if (headerFormat === 'LOCATION') previewHeader = { kind: 'location', name: locationName };

  const body = renderText(str(componentOf(components, 'BODY')?.text), values);
  const footerText = str(componentOf(components, 'FOOTER')?.text);
  const buttons = arr(componentOf(components, 'BUTTONS')?.buttons)
    .map(obj)
    .map((b, index): PreviewButton => {
      const type = str(b.type).toUpperCase();
      const known = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER', 'COPY_CODE', 'VOICE_CALL'].includes(type)
        ? (type as PreviewButton['type'])
        : 'OTHER';
      const text = str(b.text) || BUTTON_FALLBACK[type] || 'Button';
      if (known === 'URL') {
        const url = str(b.url);
        const suffix = values[urlButtonKey(index)];
        return {
          type: known,
          text,
          url: placeholdersIn(url).length && suffix ? url.replace(/\{\{[^}]*\}\}/, suffix) : url,
        };
      }
      if (known === 'COPY_CODE') {
        const code = values[copyCodeKey(index)] ?? str(b.example);
        return { type: known, text: code ? `Copy code ${code}` : text };
      }
      return { type: known, text };
    });
  const visible = TEMPLATE_LIMITS.visibleButtons;
  return {
    header: previewHeader,
    body,
    footer: footerText || null,
    buttons: buttons.length > visible ? buttons.slice(0, visible - 1) : buttons,
    hiddenButtons: buttons.length > visible ? buttons.length - (visible - 1) : 0,
    callPermission: Boolean(componentOf(components, 'CALL_PERMISSION_REQUEST')),
  };
};
