import { apiClient, unwrap } from './client';
import type {
  Agent,
  AgentCatalog,
  AgentFunction,
  AgentFunctionParam,
  AgentFunctionTestResult,
  AgentRow,
  AgentTemplate,
  AgentUsage,
  CompilePreview,
  ListEnvelope,
  OffsetPageMeta,
  SuccessEnvelope,
} from './types';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends unknown[] ? T[K] : T[K] extends object ? Partial<T[K]> : T[K];
};

/** Editable agent fields (PATCH sends only what changed; nested objects merge one level). */
export type AgentPatch = DeepPartial<
  Omit<
    Agent,
    | 'id'
    | 'functions'
    | 'isActive'
    | 'templateKey'
    | 'createdBy'
    | 'updatedBy'
    | 'createdAt'
    | 'updatedAt'
  >
>;

export interface ListAgentsQuery {
  q?: string;
  activeOnly?: boolean;
  page?: number;
  limit?: number;
}

/** A header as sent: secret headers with `value: null` keep the stored secret. */
export interface FunctionHeaderInput {
  name: string;
  secret: boolean;
  value: string | null;
}

export interface FunctionInput {
  name: string;
  description: string;
  parameters: AgentFunctionParam[];
  method: AgentFunction['method'];
  url: string;
  headers: FunctionHeaderInput[];
  bodyTemplate: string | null;
  resultPath: string | null;
  responseHint: string | null;
  timeoutMs: number;
}

export interface FunctionTestInput {
  args: Record<string, unknown>;
  contactId?: string;
  testPhone?: string;
}

/** `/api/v1/agents` — AI agents, templates, prompt preview, functions. */
export const agentsApi = {
  list: async (query: ListAgentsQuery = {}) =>
    (
      await apiClient.get<ListEnvelope<AgentRow, OffsetPageMeta>>('/agents', {
        params: { ...query, activeOnly: query.activeOnly ? 'true' : undefined },
      })
    ).data,
  get: (id: string) => unwrap(apiClient.get<SuccessEnvelope<Agent>>(`/agents/${id}`)),
  create: (body: { name: string; description?: string | null; templateKey?: string }) =>
    unwrap(apiClient.post<SuccessEnvelope<Agent>>('/agents', body)),
  update: (id: string, patch: AgentPatch) =>
    unwrap(apiClient.patch<SuccessEnvelope<Agent>>(`/agents/${id}`, patch)),
  remove: async (id: string) => {
    await apiClient.delete(`/agents/${id}`);
  },
  duplicate: (id: string) =>
    unwrap(apiClient.post<SuccessEnvelope<Agent>>(`/agents/${id}/duplicate`)),
  setActive: (id: string, active: boolean) =>
    unwrap(
      apiClient.post<SuccessEnvelope<Agent>>(`/agents/${id}/${active ? 'activate' : 'deactivate'}`),
    ),
  templates: () => unwrap(apiClient.get<SuccessEnvelope<AgentTemplate[]>>('/agents/templates')),
  catalog: () => unwrap(apiClient.get<SuccessEnvelope<AgentCatalog>>('/agents/catalog')),
  compilePreview: (
    id: string,
    body: { contactId?: string; variables?: Record<string, string>; channel?: 'text' | 'voice' },
  ) =>
    unwrap(apiClient.post<SuccessEnvelope<CompilePreview>>(`/agents/${id}/compile-preview`, body)),
  usage: (id: string) => unwrap(apiClient.get<SuccessEnvelope<AgentUsage>>(`/agents/${id}/usage`)),

  createFunction: (id: string, body: FunctionInput) =>
    unwrap(apiClient.post<SuccessEnvelope<Agent>>(`/agents/${id}/functions`, body)),
  updateFunction: (id: string, fnId: string, body: Partial<FunctionInput>) =>
    unwrap(apiClient.patch<SuccessEnvelope<Agent>>(`/agents/${id}/functions/${fnId}`, body)),
  deleteFunction: (id: string, fnId: string) =>
    unwrap(apiClient.delete<SuccessEnvelope<Agent>>(`/agents/${id}/functions/${fnId}`)),
  testFunction: (id: string, fnId: string, body: FunctionTestInput) =>
    unwrap(
      apiClient.post<SuccessEnvelope<AgentFunctionTestResult>>(
        `/agents/${id}/functions/${fnId}/test`,
        body,
      ),
    ),
};
