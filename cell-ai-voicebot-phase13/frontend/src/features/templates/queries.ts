import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { adminKeys } from '@/features/admin/keys';
import { walletKeys } from '@/features/wallet/keys';
import { adminWhatsappBillingApi, type MonthQuery } from '@/services/api/admin-whatsapp-billing';
import {
  templatesApi,
  type CallPermissionInput,
  type DeleteScope,
  type ListTemplatesQuery,
  type TemplateMediaInput,
} from '@/services/api/templates';
import type {
  WhatsAppBillingInput,
  WhatsAppBillingSettingsPatch,
  WhatsAppPricePreviewBody,
  WhatsAppRateCardSave,
  WhatsAppTemplate,
  WhatsAppTemplateCreate,
  WhatsAppTemplateEdit,
  WhatsAppTemplateListItem,
  WhatsAppTemplateStatus,
  WhatsAppVariableSourceInput,
} from '@/services/api/types';
import { whatsappApi } from '@/services/api/whatsapp';
import { useWsEvent } from '@/services/realtime';

import { templateKeys, whatsappBillingKeys } from './keys';

export { useCanManageTemplates } from './permissions';

/** Poll while Meta reviews a template (live updates can be off — Phase 8 lesson). */
export const TEMPLATE_POLL_MS = 5_000;
/** Statuses that change without the user (review, deletion). */
export const SETTLING_TEMPLATE_STATUSES: readonly WhatsAppTemplateStatus[] = [
  'PENDING',
  'PENDING_DELETION',
  'IN_APPEAL',
];
/** Statuses a template can be sent in. */
export const SENDABLE_TEMPLATE_STATUSES: readonly WhatsAppTemplateStatus[] = [
  'APPROVED',
  'FLAGGED',
];

const settling = (rows: { status: WhatsAppTemplateStatus }[]) =>
  rows.some((t) => SETTLING_TEMPLATE_STATUSES.includes(t.status));

export const useTemplates = (query: ListTemplatesQuery = {}, enabled = true) =>
  useQuery({
    queryKey: templateKeys.list(query),
    queryFn: () => templatesApi.list(query),
    enabled,
    refetchInterval: (q) => (q.state.data && settling(q.state.data) ? TEMPLATE_POLL_MS : false),
  });

export const useTemplate = (id: string | null) =>
  useQuery({
    queryKey: templateKeys.detail(id ?? ''),
    queryFn: () => templatesApi.get(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data && settling([q.state.data]) ? TEMPLATE_POLL_MS : false),
  });

/** Puts a template returned by an action into its detail and every list. */
export const storeTemplate = (client: QueryClient, template: WhatsAppTemplate): void => {
  client.setQueryData(templateKeys.detail(template.id), template);
  client.setQueriesData<WhatsAppTemplateListItem[]>({ queryKey: templateKeys.lists }, (rows) =>
    rows?.map((r) => (r.id === template.id ? { ...r, ...listItemOf(template) } : r)),
  );
  void client.invalidateQueries({ queryKey: templateKeys.lists });
};

const listItemOf = (t: WhatsAppTemplate): WhatsAppTemplateListItem => ({
  id: t.id,
  name: t.name,
  language: t.language,
  category: t.category,
  previousCategory: t.previousCategory,
  status: t.status,
  statusReason: t.statusReason,
  quality: t.quality,
  pausedUntil: t.pausedUntil,
  purpose: t.purpose,
  editable: t.editable,
  parameterFormat: t.parameterFormat,
  channelIds: t.channelIds,
  variablesCount: t.variablesCount,
  submitted: t.submitted,
  usage: t.usage,
  syncedAt: t.syncedAt,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

/**
 * `whatsapp.template.updated` (mounted on the templates tab and the send dialog):
 * patch status / quality / category at once, then refetch.
 */
export const useTemplateLiveUpdates = (): void => {
  const client = useQueryClient();
  useWsEvent('whatsapp.template.updated', (event) => {
    const { templateId, ...patch } = event.data;
    client.setQueriesData<WhatsAppTemplateListItem[]>({ queryKey: templateKeys.lists }, (rows) =>
      rows?.map((r) => (r.id === templateId ? { ...r, ...patch } : r)),
    );
    client.setQueryData<WhatsAppTemplate>(templateKeys.detail(templateId), (t) =>
      t ? { ...t, ...patch } : t,
    );
    void client.invalidateQueries({ queryKey: templateKeys.lists });
    void client.invalidateQueries({ queryKey: templateKeys.detail(templateId) });
  });
};

const useTemplateMutation = <TArgs>(
  fn: (args: TArgs) => Promise<WhatsAppTemplate>,
  silent = false,
) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    meta: { silent },
    onSuccess: (template) => {
      storeTemplate(client, template);
    },
  });
};

/** Silent: the builder shows field errors (422 details) itself. */
export const useCreateTemplate = () =>
  useTemplateMutation((body: WhatsAppTemplateCreate) => templatesApi.create(body), true);
export const useEditTemplate = () =>
  useTemplateMutation(
    ({ id, body }: { id: string; body: WhatsAppTemplateEdit }) => templatesApi.edit(id, body),
    true,
  );
export const useSubmitTemplate = () =>
  useTemplateMutation((id: string) => templatesApi.submit(id), true);
export const useSetVariableSources = () =>
  useTemplateMutation(({ id, sources }: { id: string; sources: WhatsAppVariableSourceInput[] }) =>
    templatesApi.setVariables(id, sources),
  );
export const useCreateCallPermissionTemplate = () =>
  useTemplateMutation((body: CallPermissionInput) => templatesApi.callPermission(body), true);
/** Silent: the upload field shows progress and errors itself. */
export const useUploadTemplateMedia = () =>
  useTemplateMutation(
    ({ id, input }: { id: string; input: TemplateMediaInput }) =>
      templatesApi.uploadMedia(id, input),
    true,
  );

export const useDeleteTemplate = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: DeleteScope }) =>
      templatesApi.remove(id, scope),
    onSuccess: (_r, { id }) => {
      void client.invalidateQueries({ queryKey: templateKeys.lists });
      void client.invalidateQueries({ queryKey: templateKeys.detail(id) });
    },
  });
};

export const useSyncTemplates = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (channelId: string) => templatesApi.sync(channelId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: templateKeys.all });
    },
  });
};

/** Price of one message (send dialog / composer hint). Silent: the cost line explains errors. */
export const usePricePreview = (body: WhatsAppPricePreviewBody | null) =>
  useQuery({
    queryKey: templateKeys.pricePreview(
      body
        ? [
            body.channelId,
            body.contactId ?? body.phone ?? '',
            body.templateId ?? body.category ?? '',
          ]
        : ['none'],
    ),
    queryFn: () => whatsappApi.pricePreview(body as WhatsAppPricePreviewBody),
    enabled: Boolean(body),
    staleTime: 60_000,
    meta: { silent: true },
  });

/** Superadmin WhatsApp billing. */
export const useWhatsAppRates = () =>
  useQuery({ queryKey: whatsappBillingKeys.rates, queryFn: adminWhatsappBillingApi.rates });

/** Phase 12: the calling card (per minute). */
export const useWhatsAppCallingRates = () =>
  useQuery({
    queryKey: whatsappBillingKeys.callingRates,
    queryFn: adminWhatsappBillingApi.callingRates,
  });

export const useImportWhatsAppCallingRates = () =>
  useMutation({
    mutationFn: ({ file, fileName }: { file: Blob; fileName?: string }) =>
      adminWhatsappBillingApi.importCallingRates(file, fileName),
    meta: { silent: true },
  });

export const useImportWhatsAppRates = () =>
  useMutation({
    mutationFn: ({ file, fileName }: { file: Blob; fileName?: string }) =>
      adminWhatsappBillingApi.importRates(file, fileName),
    meta: { silent: true },
  });

export const useSaveWhatsAppRates = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: WhatsAppRateCardSave) => adminWhatsappBillingApi.saveRates(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: whatsappBillingKeys.rates });
      void client.invalidateQueries({ queryKey: whatsappBillingKeys.callingRates });
      void client.invalidateQueries({ queryKey: walletKeys.all });
    },
  });
};

export const useWhatsAppBillingSettings = () =>
  useQuery({ queryKey: whatsappBillingKeys.settings, queryFn: adminWhatsappBillingApi.settings });

export const useUpdateWhatsAppBillingSettings = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: WhatsAppBillingSettingsPatch) =>
      adminWhatsappBillingApi.updateSettings(body),
    onSuccess: (view) => {
      client.setQueryData(whatsappBillingKeys.settings, view);
    },
  });
};

export const useSetAccountWhatsAppBilling = (accountId: string) => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: WhatsAppBillingInput) =>
      adminWhatsappBillingApi.setAccountBilling(accountId, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: adminKeys.account(accountId) });
    },
  });
};

export const useWhatsAppMargin = (query: MonthQuery) =>
  useQuery({
    queryKey: whatsappBillingKeys.margin(query.month, query.accountId),
    queryFn: () => adminWhatsappBillingApi.margin(query),
  });

export const useWhatsAppReconciliation = (query: MonthQuery) =>
  useQuery({
    queryKey: whatsappBillingKeys.reconciliation(query.month, query.accountId),
    queryFn: () => adminWhatsappBillingApi.reconciliation(query),
  });
