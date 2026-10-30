import { apiClient, unwrap } from './client';
import type {
  DraftGraph,
  Flow,
  FlowCatalog,
  FlowDraftSaved,
  FlowImportResult,
  FlowIssue,
  FlowListItem,
  FlowNodeStat,
  FlowTemplate,
  FlowVariableInfo,
  FlowVersion,
  FlowVersionSummary,
  ListEnvelope,
  OffsetPageMeta,
  SuccessEnvelope,
} from './types';

export interface ListFlowsQuery {
  q?: string;
  status?: Flow['status'];
  page?: number;
  limit?: number;
}

export interface CreateFlowInput {
  name: string;
  description?: string | null;
  templateKey?: string;
  /** Template AI node id → agent id. */
  agentIds?: Record<string, string>;
}

export interface StatsQuery {
  version?: 'draft' | number;
  mode?: 'simulator' | 'call';
  from?: string;
  to?: string;
}

/** `/api/v1/flows` — call flows, drafts, versions, templates, import / export. */
export const flowsApi = {
  list: async (query: ListFlowsQuery = {}) =>
    (await apiClient.get<ListEnvelope<FlowListItem, OffsetPageMeta>>('/flows', { params: query }))
      .data,
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<Flow>>(`/flows/${id}`)),
  create: (body: CreateFlowInput) => unwrap(apiClient.post<SuccessEnvelope<Flow>>('/flows', body)),
  update: (id: string, body: { name?: string; description?: string | null }) =>
    unwrap(apiClient.patch<SuccessEnvelope<Flow>>(`/flows/${id}`, body)),
  remove: async (id: string) => {
    await apiClient.delete(`/flows/${id}`);
  },
  /** 409 `FLOW_REVISION_CONFLICT` when someone saved since `revision`. */
  saveDraft: (id: string, revision: number, graph: DraftGraph) =>
    unwrap(
      apiClient.put<SuccessEnvelope<FlowDraftSaved>>(`/flows/${id}/draft`, { revision, graph }),
    ),
  validate: (id: string, graph?: DraftGraph) =>
    unwrap(
      apiClient.post<SuccessEnvelope<FlowIssue[]>>(`/flows/${id}/validate`, graph ? { graph } : {}),
    ),
  /** 422 `FLOW_INVALID` (details = issues) when the draft has errors. */
  publish: (id: string, revision: number, notes?: string | null) =>
    unwrap(
      apiClient.post<SuccessEnvelope<FlowVersionSummary>>(`/flows/${id}/publish`, {
        revision,
        notes,
      }),
    ),
  versions: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<FlowVersionSummary[]>>(`/flows/${id}/versions`)),
  version: (id: string, version: number) =>
    unwrap(apiClient.get<SuccessEnvelope<FlowVersion>>(`/flows/${id}/versions/${String(version)}`)),
  restore: (id: string, version: number, revision: number) =>
    unwrap(
      apiClient.post<SuccessEnvelope<Flow>>(`/flows/${id}/versions/${String(version)}/restore`, {
        revision,
      }),
    ),
  duplicate: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Flow>>(`/flows/${id}/duplicate`)),
  archive: (id: string) => unwrap(apiClient.post<SuccessEnvelope<Flow>>(`/flows/${id}/archive`)),
  unarchive: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Flow>>(`/flows/${id}/unarchive`)),
  /** The flow JSON + its file name (from `Content-Disposition`). */
  exportFile: async (id: string, version: 'draft' | number = 'draft') => {
    const res = await apiClient.get<unknown>(`/flows/${id}/export`, { params: { version } });
    const disposition = String(res.headers['content-disposition'] ?? '');
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `flow-${id}.json`;
    return { fileName, data: res.data };
  },
  importFile: (file: unknown, name?: string) =>
    unwrap(
      apiClient.post<SuccessEnvelope<FlowImportResult>>('/flows/import', {
        file,
        ...(name ? { name } : {}),
      }),
    ),
  templates: () => unwrap(apiClient.get<SuccessEnvelope<FlowTemplate[]>>('/flows/templates')),
  catalog: () => unwrap(apiClient.get<SuccessEnvelope<FlowCatalog>>('/flows/catalog')),
  variables: (id: string) =>
    unwrap(apiClient.get<SuccessEnvelope<FlowVariableInfo[]>>(`/flows/${id}/variables`)),
  stats: (id: string, query: StatsQuery = {}) =>
    unwrap(apiClient.get<SuccessEnvelope<FlowNodeStat[]>>(`/flows/${id}/stats`, { params: query })),
};
