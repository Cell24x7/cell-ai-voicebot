import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useMemo, useState, type ComponentType } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { Navigate, Link as RouterLink, useNavigate, useParams } from 'react-router';

import { useUnsavedChangesGuard } from '@/components/fields/useUnsavedChangesGuard';
import { PageHeader } from '@/components/PageHeader';
import {
  formFieldOf,
  formProblems,
  tabOfField,
  toForm,
  toPatch,
  type AgentForm,
  type EditorTab,
} from '@/features/agents/agent-form';
import { BasicTab } from '@/features/agents/editor/BasicTab';
import { countErrors, type EditorTabProps } from '@/features/agents/editor/editor-context';
import { LimitsTab } from '@/features/agents/editor/LimitsTab';
import { PromptPreviewDrawer } from '@/features/agents/editor/PromptPreviewDrawer';
import { VoiceTab } from '@/features/agents/editor/VoiceTab';
import { FunctionsTab } from '@/features/agents/functions/FunctionsTab';
import { agentKeys } from '@/features/agents/keys';
import { PlaygroundTab } from '@/features/agents/playground/PlaygroundTab';
import {
  useAgent,
  useAgentCatalog,
  useAgentUsage,
  useCanWriteAgents,
} from '@/features/agents/queries';
import { TestCallButton } from '@/features/calls/TestCallButton';
import { KnowledgeTab } from '@/features/knowledge/KnowledgeTab';
import { useImpersonating } from '@/features/wallet/queries';
import { agentsApi } from '@/services/api/agents';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { Agent } from '@/services/api/types';
import { useWsEvent } from '@/services/realtime';
import { formatCurrencyMicros } from '@/utils/format';

interface TabDef {
  key: string;
  label: string;
  /** Form tabs share one form and the Save button; other tabs save on their own. */
  formTab?: EditorTab;
  Component: ComponentType<EditorTabProps>;
}

const EDITOR_TABS: TabDef[] = [
  { key: 'basic', label: 'Basic', formTab: 'basic', Component: BasicTab },
  { key: 'voice', label: 'Voice & Language', formTab: 'voice', Component: VoiceTab },
  { key: 'limits', label: 'Limits', formTab: 'limits', Component: LimitsTab },
  { key: 'functions', label: 'Functions', Component: FunctionsTab },
  { key: 'knowledge', label: 'Knowledge', Component: KnowledgeTab },
  { key: 'playground', label: 'Playground', Component: PlaygroundTab },
];

/** `/agents/:id/:tab` — the agent editor. */
export function AgentEditorPage() {
  const { id = '', tab = 'basic' } = useParams();
  const agent = useAgent(id);
  const current = EDITOR_TABS.find((t) => t.key === tab);
  if (!current) return <Navigate to={`/agents/${id}/basic`} replace />;
  if (agent.isError) {
    return (
      <>
        <PageHeader title="Agent" />
        <Alert
          severity="error"
          action={<Button onClick={() => void agent.refetch()}>Retry</Button>}
        >
          {getErrorMessage(agent.error)}
        </Alert>
      </>
    );
  }
  if (!agent.data) {
    return (
      <>
        <Skeleton variant="text" width={240} height={48} />
        <Skeleton variant="rounded" height={320} />
      </>
    );
  }
  return <Editor key={agent.data.id} loaded={agent.data} tab={current} />;
}

function Editor({ loaded, tab }: { loaded: Agent; tab: TabDef }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalog = useAgentCatalog();
  const usage = useAgentUsage(loaded.id);
  const canWrite = useCanWriteAgents();
  const impersonating = useImpersonating();
  const readOnly = !canWrite;
  const [base, setBase] = useState<Agent>(loaded);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const baseForm = useMemo(() => toForm(base), [base]);
  const form = useForm<AgentForm>({
    defaultValues: baseForm,
    values: baseForm,
    resetOptions: { keepDirtyValues: true },
  });
  const dirty = form.formState.isDirty;
  useUnsavedChangesGuard(dirty, (path) => path.startsWith(`/agents/${base.id}/`));

  const adopt = (next: Agent) => {
    setBase(next);
    queryClient.setQueryData(agentKeys.detail(next.id), next);
    void queryClient.invalidateQueries({ queryKey: agentKeys.lists });
  };

  const save = useMutation({
    mutationFn: (values: AgentForm) => agentsApi.update(base.id, toPatch(baseForm, values)),
    onSuccess: (next) => {
      adopt(next);
      form.reset(toForm(next));
      enqueueSnackbar('Agent saved', { variant: 'success' });
    },
    onError: (err) => {
      const { details } = toApiError(err);
      for (const d of details) {
        form.setError(formFieldOf(d.path) as Path<AgentForm>, {
          type: 'server',
          message: d.message,
        });
      }
      enqueueSnackbar(details.length ? 'Fix the highlighted fields' : getErrorMessage(err), {
        variant: 'error',
      });
    },
  });
  const toggle = useMutation({
    mutationFn: (active: boolean) => agentsApi.setActive(base.id, active),
    onSuccess: (next) => {
      adopt(next);
      enqueueSnackbar(next.isActive ? 'Agent is on' : 'Agent is off', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });

  // another tab / person saved this agent → offer a reload (our own saves update `base` first)
  useWsEvent('agent.updated', (event) => {
    if (event.data.agentId !== base.id || save.isPending || toggle.isPending) return;
    void agentsApi.get(base.id).then((fresh) => {
      if (fresh.updatedAt !== base.updatedAt) setChangedElsewhere(true);
    });
  });

  const onSave = form.handleSubmit((values) => {
    const problems = formProblems(values);
    const fields = Object.keys(problems);
    for (const field of fields) {
      form.setError(field as Path<AgentForm>, { type: 'client', message: problems[field] });
    }
    if (fields.length) {
      enqueueSnackbar('Fix the highlighted fields', { variant: 'error' });
      return;
    }
    if (Object.keys(toPatch(baseForm, values)).length === 0) {
      form.reset(values);
      return;
    }
    save.mutate(values);
  });

  const errorCount = (formTab: EditorTab | undefined) =>
    formTab
      ? Object.entries(form.formState.errors).reduce(
          (sum, [field, err]) => sum + (tabOfField(field) === formTab ? countErrors(err) : 0),
          0,
        )
      : 0;

  const reload = async () => {
    const fresh = await agentsApi.get(base.id);
    setBase(fresh);
    queryClient.setQueryData(agentKeys.detail(fresh.id), fresh);
    form.reset(toForm(fresh));
    setChangedElsewhere(false);
  };

  return (
    <>
      <PageHeader
        title={base.name}
        subtitle={base.description ?? undefined}
        actions={
          <>
            <Button component={RouterLink} to="/agents" startIcon={<ArrowBackOutlined />}>
              All agents
            </Button>
            <Button startIcon={<VisibilityOutlined />} onClick={() => setPreviewOpen(true)}>
              Prompt preview
            </Button>
            <TestCallButton kind="agent" agentId={base.id} active={base.isActive} dirty={dirty} />
            {!readOnly && tab.formTab && (
              <Button
                variant="contained"
                onClick={() => void onSave()}
                disabled={!dirty || save.isPending}
              >
                Save
              </Button>
            )}
          </>
        }
      />
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={base.isActive}
              onChange={(e) => toggle.mutate(e.target.checked)}
              disabled={readOnly || toggle.isPending}
            />
          }
          label={base.isActive ? 'On' : 'Off'}
        />
        {usage.data && (
          <Chip
            size="small"
            variant="outlined"
            label={`This month ${formatCurrencyMicros(usage.data.month.spentMicros)} · today ${formatCurrencyMicros(usage.data.today.spentMicros)}`}
          />
        )}
        {usage.data && usage.data.flows.length > 0 && (
          <Tooltip title={usage.data.flows.map((f) => f.name).join(', ')}>
            <Chip
              size="small"
              color="info"
              variant="outlined"
              label={`Used in ${String(usage.data.flows.length)} flow${usage.data.flows.length === 1 ? '' : 's'}`}
            />
          </Tooltip>
        )}
      </Stack>
      {readOnly && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {impersonating
            ? 'You are viewing as this account — agents cannot be changed while impersonating.'
            : 'Read-only: you can view this agent but not change it.'}
        </Alert>
      )}
      {changedElsewhere && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={<Button onClick={() => void reload()}>Reload</Button>}
        >
          This agent was changed elsewhere — reload to see the latest version
          {dirty ? ' (your unsaved changes will be lost)' : ''}.
        </Alert>
      )}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tab.key}
          onChange={(_e, v: string) => void navigate(`/agents/${base.id}/${v}`)}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Agent sections"
        >
          {EDITOR_TABS.map((t) => {
            const count = errorCount(t.formTab);
            return (
              <Tab
                key={t.key}
                value={t.key}
                label={
                  count ? (
                    <Badge badgeContent={count} color="error" sx={{ pr: 1.5 }}>
                      {t.label}
                    </Badge>
                  ) : (
                    t.label
                  )
                }
                aria-label={count ? `${t.label} (${count} errors)` : t.label}
              />
            );
          })}
        </Tabs>
      </Box>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave();
        }}
        noValidate
      >
        <tab.Component
          agent={base}
          catalog={catalog.data}
          form={form}
          readOnly={readOnly}
          onAgentChange={adopt}
        />
      </form>
      <PromptPreviewDrawer
        agent={base}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        dirty={dirty}
      />
    </>
  );
}
