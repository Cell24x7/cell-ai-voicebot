import { useQuery } from '@tanstack/react-query';

import { usePermission } from '@/features/auth/hooks';
import { useImpersonating } from '@/features/wallet/queries';
import { agentsApi, type ListAgentsQuery } from '@/services/api/agents';

import { agentKeys } from './keys';

/** May this user change agents now (agents.write, never while impersonating)? */
export const useCanWriteAgents = (): boolean => {
  const canWrite = usePermission('agents.write');
  const impersonating = useImpersonating();
  return canWrite && !impersonating;
};

export const useAgents = (query: ListAgentsQuery) =>
  useQuery({ queryKey: agentKeys.list(query), queryFn: () => agentsApi.list(query) });

export const useAgent = (id: string) =>
  useQuery({ queryKey: agentKeys.detail(id), queryFn: () => agentsApi.get(id) });

export const useAgentUsage = (id: string) =>
  useQuery({ queryKey: agentKeys.usage(id), queryFn: () => agentsApi.usage(id) });

export const useAgentCatalog = () =>
  useQuery({ queryKey: agentKeys.catalog, queryFn: agentsApi.catalog, staleTime: 5 * 60_000 });

export const useAgentTemplates = () =>
  useQuery({ queryKey: agentKeys.templates, queryFn: agentsApi.templates, staleTime: Infinity });
