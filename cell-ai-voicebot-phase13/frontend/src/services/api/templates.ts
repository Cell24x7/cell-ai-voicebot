import { apiClient, unwrap } from './client';
import type {
  SuccessEnvelope,
  WhatsAppTemplate,
  WhatsAppTemplateCategory,
  WhatsAppTemplateCreate,
  WhatsAppTemplateEdit,
  WhatsAppTemplateListItem,
  WhatsAppTemplatePurpose,
  WhatsAppTemplateStatus,
  WhatsAppTemplateSyncResult,
  WhatsAppVariableSourceInput,
} from './types';

export interface ListTemplatesQuery {
  channelId?: string;
  /** Several statuses → comma-separated on the wire. */
  status?: WhatsAppTemplateStatus[];
  category?: WhatsAppTemplateCategory;
  purpose?: WhatsAppTemplatePurpose;
  q?: string;
  includeDeleted?: boolean;
}

export interface CallPermissionInput {
  channelId: string;
  language?: string;
  body?: string;
  submit?: boolean;
}

export interface TemplateMediaInput {
  file: Blob;
  fileName?: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** `language` = this language only; `name` = every language of the name. */
export type DeleteScope = 'language' | 'name';

const tpl = (id: string, action = '') => `/whatsapp/templates/${id}${action}`;

const listParams = ({ status, includeDeleted, ...rest }: ListTemplatesQuery) => ({
  ...rest,
  ...(status?.length ? { status: status.join(',') } : {}),
  ...(includeDeleted ? { includeDeleted: 'true' } : {}),
});

/** `/api/v1/whatsapp/templates` (PHASE_11_PLAN §1n). */
export const templatesApi = {
  /** List rows carry no bodies or examples. */
  list: (query: ListTemplatesQuery = {}) =>
    unwrap(
      apiClient.get<SuccessEnvelope<WhatsAppTemplateListItem[]>>('/whatsapp/templates', {
        params: listParams(query),
      }),
    ),
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<WhatsAppTemplate>>(tpl(id))),
  /** `submit: false` keeps a draft (e.g. to upload a media header example first). */
  create: (body: WhatsAppTemplateCreate) =>
    unwrap(apiClient.post<SuccessEnvelope<WhatsAppTemplate>>('/whatsapp/templates', body)),
  edit: (id: string, body: WhatsAppTemplateEdit) =>
    unwrap(apiClient.patch<SuccessEnvelope<WhatsAppTemplate>>(tpl(id), body)),
  submit: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<WhatsAppTemplate>>(tpl(id, '/submit'))),
  remove: (id: string, scope: DeleteScope = 'language') =>
    unwrap(apiClient.delete<SuccessEnvelope<{ deleted: number }>>(tpl(id), { params: { scope } })),
  setVariables: (id: string, sources: WhatsAppVariableSourceInput[]) =>
    unwrap(apiClient.patch<SuccessEnvelope<WhatsAppTemplate>>(tpl(id, '/variables'), { sources })),
  /** 1 / min / number on the server (429 `RATE_LIMITED`). */
  sync: (channelId: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppTemplateSyncResult>>('/whatsapp/templates/sync', {
        channelId,
      }),
    ),
  callPermission: (body: CallPermissionInput) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppTemplate>>(
        '/whatsapp/templates/call-permission',
        body,
      ),
    ),
  /** Media header example (multipart). No timeout: big files, the user can cancel. */
  uploadMedia: (id: string, { file, fileName, onProgress, signal }: TemplateMediaInput) => {
    const form = new FormData();
    if (fileName === undefined) form.append('file', file);
    else form.append('file', file, fileName);
    return unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppTemplate>>(tpl(id, '/media'), form, {
        timeout: 0,
        ...(signal ? { signal } : {}),
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      }),
    );
  },
};
