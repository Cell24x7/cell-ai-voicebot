import ScienceOutlined from '@mui/icons-material/ScienceOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useCallback, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { TestCallButton } from '@/features/calls/TestCallButton';
import { FlowCampaignsButton } from '@/features/campaigns/FlowCampaignsButton';
import { FlowBuilder } from '@/features/flows/builder/FlowBuilder';
import { FlowDialogs } from '@/features/flows/inspector/FlowDialogs';
import { StepForm } from '@/features/flows/inspector/StepForm';
import {
  useCanPublishFlows,
  useCanWriteFlows,
  useFlow,
  useFlowCatalog,
  useFlowVariables,
  useFlowVersion,
} from '@/features/flows/queries';
import { SimulatorPanel } from '@/features/flows/simulator/SimulatorPanel';
import { useStatsOverlay, type StatsSelection } from '@/features/flows/simulator/stats';
import { StatsControl } from '@/features/flows/simulator/StatsControl';
import { useImpersonating } from '@/features/wallet/queries';
import { getErrorMessage } from '@/services/api/errors';
import type { DraftGraph, FlowVariable } from '@/services/api/types';

/** `/flows/:id` (builder) and `/flows/:id?v=3` (a published version, read-only). Lazy-loaded. */
export function FlowBuilderPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const v = Number(params.get('v'));
  const versionNumber = Number.isInteger(v) && v > 0 ? v : null;
  const flow = useFlow(id);
  const catalog = useFlowCatalog();
  const version = useFlowVersion(id, versionNumber);
  const known = useFlowVariables(id);
  const canWrite = useCanWriteFlows();
  const canPublish = useCanPublishFlows();
  const impersonating = useImpersonating();
  const small = useMediaQuery('(max-width:899.95px)');
  const [simOpen, setSimOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [state, setState] = useState<{ dirty: boolean; variables: FlowVariable[] }>({
    dirty: false,
    variables: [],
  });
  const onState = useCallback(
    ({ graph, dirty }: { graph: DraftGraph; dirty: boolean }) =>
      setState({ dirty, variables: graph.variables }),
    [],
  );
  const [statsSel, setStatsSel] = useState<StatsSelection>({
    on: false,
    version: versionNumber ?? 'draft',
    days: 7,
  });
  const stats = useStatsOverlay(id, statsSel);

  const error = flow.error ?? catalog.error ?? version.error;
  if (error) {
    return (
      <Alert severity="error" action={<Button onClick={() => void flow.refetch()}>Retry</Button>}>
        {getErrorMessage(error)}
      </Alert>
    );
  }
  if (!flow.data || !catalog.data || (versionNumber !== null && !version.data)) {
    return <Skeleton variant="rounded" height={480} aria-label="Loading the flow" />;
  }

  const reason = versionNumber
    ? `You are viewing published version v${String(versionNumber)}. Restore it from Versions to edit it.`
    : impersonating
      ? 'You are viewing as this account — flows cannot be changed while impersonating.'
      : !canWrite
        ? 'Read-only: you can view this flow but not change it.'
        : small
          ? 'The builder needs a wider screen to edit — this is a read-only view.'
          : undefined;

  return (
    <FlowBuilder
      key={`${flow.data.id}:${String(versionNumber ?? 'draft')}`}
      flow={flow.data}
      catalog={catalog.data}
      readOnly={Boolean(reason)}
      readOnlyReason={reason}
      canPublish={canPublish && !small}
      version={
        versionNumber && version.data
          ? { number: versionNumber, graph: version.data.graph as unknown as DraftGraph }
          : undefined
      }
      onState={onState}
      highlightId={highlight}
      stats={stats.map}
      toolbar={
        <>
          <StatsControl
            value={statsSel}
            onChange={setStatsSel}
            publishedVersion={flow.data.publishedVersion}
          />
          {!versionNumber && (
            <TestCallButton
              kind="flow"
              flowId={flow.data.id}
              publishedVersion={flow.data.publishedVersion}
              dirty={state.dirty}
            />
          )}
          {!versionNumber && <FlowCampaignsButton flow={flow.data} />}
          {!versionNumber && (
            <Button
              startIcon={<ScienceOutlined />}
              variant={simOpen ? 'contained' : 'text'}
              onClick={() => setSimOpen((o) => !o)}
            >
              Simulator
            </Button>
          )}
        </>
      }
      side={
        simOpen && !versionNumber ? (
          <SimulatorPanel
            flow={flow.data}
            dirty={state.dirty}
            canRun={canWrite && !impersonating}
            known={known.data}
            flowVariables={state.variables}
            onNode={setHighlight}
            onClose={() => {
              setSimOpen(false);
              setHighlight(null);
            }}
          />
        ) : undefined
      }
      renderForm={(node, apply, readOnly, { graph, fieldErrors }) => (
        <StepForm
          node={node}
          apply={apply}
          readOnly={readOnly}
          graph={graph}
          fieldErrors={fieldErrors}
          catalog={catalog.data}
          known={known.data}
        />
      )}
      renderDialogs={(graph, apply, readOnly) => (
        <FlowDialogs
          graph={graph}
          apply={apply}
          readOnly={readOnly}
          catalog={catalog.data}
          known={known.data}
        />
      )}
    />
  );
}
