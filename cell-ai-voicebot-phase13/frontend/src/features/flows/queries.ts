import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { usePermission } from '@/features/auth/hooks';
import { useImpersonating } from '@/features/wallet/queries';
import { flowAudioApi } from '@/services/api/flow-audio';
import { flowSimulatorApi } from '@/services/api/flow-simulator';
import { flowsApi, type ListFlowsQuery, type StatsQuery } from '@/services/api/flows';
import { useWsEvent } from '@/services/realtime';

import { flowAudioKeys, flowKeys, simulationKeys } from './keys';

/** flows.write and not impersonating. */
export const useCanWriteFlows = (): boolean => {
  const can = usePermission('flows.write');
  const impersonating = useImpersonating();
  return can && !impersonating;
};

/** flows.publish and not impersonating. */
export const useCanPublishFlows = (): boolean => {
  const can = usePermission('flows.publish');
  const impersonating = useImpersonating();
  return can && !impersonating;
};

export const useFlows = (query: ListFlowsQuery) =>
  useQuery({ queryKey: flowKeys.list(query), queryFn: () => flowsApi.list(query) });

export const useFlow = (id: string) =>
  useQuery({ queryKey: flowKeys.detail(id), queryFn: () => flowsApi.get(id) });

export const useFlowCatalog = () =>
  useQuery({ queryKey: flowKeys.catalog, queryFn: flowsApi.catalog, staleTime: Infinity });

/** Node type → catalogue entry. */
export const useCatalogMap = () => {
  const catalog = useFlowCatalog();
  const map = useMemo(
    () => new Map((catalog.data?.nodes ?? []).map((n) => [n.type, n])),
    [catalog.data],
  );
  return { ...catalog, map };
};

export const useFlowTemplates = () =>
  useQuery({ queryKey: flowKeys.templates, queryFn: flowsApi.templates, staleTime: Infinity });

export const useFlowVariables = (id: string) =>
  useQuery({ queryKey: flowKeys.variables(id), queryFn: () => flowsApi.variables(id) });

export const useFlowVersions = (id: string) =>
  useQuery({
    queryKey: flowKeys.versions(id),
    queryFn: () => flowsApi.versions(id),
    enabled: Boolean(id),
  });

export const useFlowVersion = (id: string, version: number | null) =>
  useQuery({
    queryKey: flowKeys.version(id, version ?? 0),
    queryFn: () => flowsApi.version(id, version ?? 0),
    enabled: version !== null,
  });

export const useFlowStats = (id: string, query: StatsQuery, enabled: boolean) =>
  useQuery({
    queryKey: flowKeys.stats(id, query),
    queryFn: () => flowsApi.stats(id, query),
    enabled,
  });

export const useFlowAudio = () =>
  useQuery({ queryKey: flowAudioKeys.list, queryFn: () => flowAudioApi.list() });

export const useSimulations = (flowId: string) =>
  useQuery({ queryKey: simulationKeys.list(flowId), queryFn: () => flowSimulatorApi.list(flowId) });

export const useSimulation = (flowId: string, runId: string, enabled = true) =>
  useQuery({
    queryKey: simulationKeys.run(flowId, runId),
    queryFn: () => flowSimulatorApi.get(flowId, runId),
    enabled: enabled && Boolean(runId),
  });

/** Lists refresh when any flow changes; `onFlow` hears changes of one flow. */
export const useFlowLiveUpdates = (onFlow?: {
  flowId: string;
  onUpdated: (revision: number, by: string | null) => void;
}) => {
  const queryClient = useQueryClient();
  useWsEvent('flow.updated', (event) => {
    void queryClient.invalidateQueries({ queryKey: flowKeys.lists });
    if (onFlow && event.data.flowId === onFlow.flowId)
      onFlow.onUpdated(event.data.revision, event.data.by);
  });
  useWsEvent('flow.published', (event) => {
    void queryClient.invalidateQueries({ queryKey: flowKeys.lists });
    void queryClient.invalidateQueries({ queryKey: flowKeys.versions(event.data.flowId) });
  });
};
