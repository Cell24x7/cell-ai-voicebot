import { apiClient, unwrap } from './client';
import type {
  MetaWebhookReceipt,
  SuccessEnvelope,
  WhatsAppBusinessProfile,
  WhatsAppChannel,
  WhatsAppChannelDetail,
  WhatsAppChannelList,
  WhatsAppChannelStatus,
  WhatsAppConfig,
  WhatsAppConnectResult,
  WhatsAppMode,
  WhatsAppPricePreview,
  WhatsAppPricePreviewBody,
} from './types';

export interface EmbeddedSignupInput {
  code: string;
  mode: WhatsAppMode;
  /** Ids from Meta's WA_EMBEDDED_SIGNUP message — hints the server verifies. */
  sessionInfo?: { wabaId?: string; phoneNumberId?: string; waacId?: string };
}

export type ChannelOutcome = WhatsAppConnectResult['outcome'];
export interface ChannelActionResult {
  channel: WhatsAppChannel;
  outcome: ChannelOutcome;
}

/** Dev webhook simulator kinds (backend `SIMULATOR_KINDS`). */
export const SIMULATOR_KINDS = [
  'quality_downgrade',
  'quality_upgrade',
  'flagged',
  'name_approved',
  'name_rejected',
  'restricted',
  'unrestricted',
  'token_revoked',
  'inbound_text',
  'status_delivered',
  'echo_text',
  'history_chunk',
  'history_declined',
  'contacts_sync',
  'payment_method_added',
  'phone_number_added',
] as const;
export type SimulatorKind = (typeof SIMULATOR_KINDS)[number];

/** Template + billing simulator kinds (backend `TEMPLATE_SIMULATOR_KINDS`, Phase 11). */
export const TEMPLATE_SIMULATOR_KINDS = [
  'template_approved',
  'template_rejected',
  'template_paused',
  'template_disabled',
  'template_quality_red',
  'template_category_changed',
  'template_components_changed',
  'user_stopped_marketing',
  'user_resumed_marketing',
  'pricing_tier_update',
  'run_template_sync',
  'run_hold_reaper',
  'run_whatsapp_reconcile',
  'late_billable_status',
] as const;
export type TemplateSimulatorKind = (typeof TEMPLATE_SIMULATOR_KINDS)[number];

export interface TemplateSimulateOptions {
  templateId?: string;
  /** `late_billable_status`: the outgoing message Meta bills late. */
  messageId?: string;
  /** Customer number (`user_*_marketing`). */
  from?: string;
}

/** What the fake Meta holds for a number's WABA (names / statuses — no bodies). */
export interface FakeTemplateRow {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  quality: string | null;
}

/** Editable business profile fields (Meta limits: about ≤ 139, two websites). */
export interface BusinessProfilePatch {
  about?: string;
  address?: string;
  description?: string;
  /** `''` clears it. */
  email?: string;
  websites?: string[];
  /** One of `BUSINESS_VERTICALS`. */
  vertical?: string;
}

/** Meta's business categories (backend `BUSINESS_VERTICALS`). */
export const BUSINESS_VERTICALS = [
  'UNDEFINED',
  'OTHER',
  'AUTO',
  'BEAUTY',
  'APPAREL',
  'EDU',
  'ENTERTAIN',
  'EVENT_PLAN',
  'FINANCE',
  'GROCERY',
  'GOVT',
  'HOTEL',
  'HEALTH',
  'NONPROFIT',
  'PROF_SERVICES',
  'RETAIL',
  'TRAVEL',
  'RESTAURANT',
  'NOT_A_BIZ',
] as const;

const channel = (id: string, action = '') => `/whatsapp/channels/${id}${action}`;

/** `/api/v1/whatsapp` (PHASE_9_PLAN §1n). */
export const whatsappApi = {
  config: () => unwrap(apiClient.get<SuccessEnvelope<WhatsAppConfig>>('/whatsapp/config')),
  channels: (status?: WhatsAppChannelStatus) =>
    unwrap(
      apiClient.get<SuccessEnvelope<WhatsAppChannelList>>('/whatsapp/channels', {
        params: status ? { status } : {},
      }),
    ),
  channel: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<WhatsAppChannelDetail>>(channel(id))),
  signup: (body: EmbeddedSignupInput) =>
    unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppConnectResult>>(
        '/whatsapp/channels/embedded-signup',
        body,
      ),
    ),
  rename: (id: string, label: string) =>
    unwrap(apiClient.patch<SuccessEnvelope<WhatsAppChannel>>(channel(id), { label })),
  sync: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<ChannelActionResult>>(channel(id, '/sync'))),
  retrySetup: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<ChannelActionResult>>(channel(id, '/retry-setup'))),
  register: (id: string, pin: string) =>
    unwrap(apiClient.post<SuccessEnvelope<ChannelActionResult>>(channel(id, '/register'), { pin })),
  coexistenceSync: (id: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<{ channel: WhatsAppChannel }>>(
        channel(id, '/coexistence-sync'),
      ),
    ),
  disconnect: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<WhatsAppChannel>>(channel(id, '/disconnect'))),
  /** Business profile on WhatsApp (Phase 10). */
  profile: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<WhatsAppBusinessProfile>>(channel(id, '/profile'))),
  updateProfile: (id: string, patch: BusinessProfilePatch) =>
    unwrap(
      apiClient.patch<SuccessEnvelope<WhatsAppBusinessProfile>>(channel(id, '/profile'), patch),
    ),
  /** JPEG / PNG photo (multipart `file`). */
  uploadProfilePhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return unwrap(
      apiClient.post<SuccessEnvelope<WhatsAppBusinessProfile>>(
        channel(id, '/profile/photo'),
        form,
        {
          timeout: 0,
        },
      ),
    );
  },
  /** Price of one message to a contact / phone (template category or a service reply). */
  pricePreview: (body: WhatsAppPricePreviewBody) =>
    unwrap(apiClient.post<SuccessEnvelope<WhatsAppPricePreview>>('/whatsapp/price-preview', body)),
  /** DEV ONLY — `POST /dev/meta/webhooks` (absent in production). */
  simulate: (channelId: string, kind: SimulatorKind) =>
    unwrap(
      apiClient.post<SuccessEnvelope<MetaWebhookReceipt & { kind: string; field: string }>>(
        '/dev/meta/webhooks',
        { channelId, kind },
      ),
    ),
  /** DEV ONLY — a template / billing event (`POST /dev/meta/webhooks`). */
  simulateTemplate: (
    channelId: string,
    kind: TemplateSimulatorKind,
    options: TemplateSimulateOptions = {},
  ) =>
    unwrap(
      apiClient.post<
        SuccessEnvelope<Partial<MetaWebhookReceipt> & { kind: string; field: string }>
      >('/dev/meta/webhooks', { channelId, kind, ...options }),
    ),
  /** DEV ONLY — the fake Meta's templates of the number's WABA. */
  fakeTemplates: (channelId: string) =>
    unwrap(
      apiClient.get<SuccessEnvelope<FakeTemplateRow[]>>('/dev/meta/templates', {
        params: { channelId },
      }),
    ),
};
