import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { agentKeys } from '@/features/agents/keys';
import { flowKeys } from '@/features/flows/keys';
import { useCanWriteFlows, useFlowTemplates } from '@/features/flows/queries';
import { agentsApi } from '@/services/api/agents';
import { getErrorMessage } from '@/services/api/errors';
import { flowsApi } from '@/services/api/flows';
import type { AgentRow, FlowTemplate } from '@/services/api/types';

const BLANK: FlowTemplate = {
  key: '',
  title: 'Blank flow',
  description: 'Start → Hang up. Build everything yourself.',
  language: 'hinglish',
  aiNodes: [],
  optionalFields: [],
};

const LANGUAGES: Record<FlowTemplate['language'], string> = {
  hi: 'Hindi',
  en: 'English',
  hinglish: 'Hinglish',
};

/** Picks an agent made from the suggested agent template, if any. */
const suggested = (agents: AgentRow[], template: string | null) =>
  agents.find((a) => template && a.templateKey === template)?.id ?? '';

function CreateDialog({ template, onClose }: { template: FlowTemplate; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const agents = useQuery({
    queryKey: agentKeys.list({ limit: 100 }),
    queryFn: () => agentsApi.list({ limit: 100 }),
    enabled: template.aiNodes.length > 0,
  });
  const rows = agents.data?.data ?? [];
  const [name, setName] = useState(template.key ? template.title : '');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const agentFor = (nodeId: string, suggestion: string | null) =>
    picked[nodeId] ?? suggested(rows, suggestion);

  const createAgent = useMutation({
    mutationFn: (node: FlowTemplate['aiNodes'][number]) =>
      agentsApi.create({
        name: `${node.label} (${new Date().toLocaleDateString('en-IN')})`,
        templateKey: node.suggestedAgentTemplate ?? undefined,
      }),
    onSuccess: async (agent, node) => {
      await queryClient.invalidateQueries({ queryKey: agentKeys.all });
      setPicked((p) => ({ ...p, [node.nodeId]: agent.id }));
      enqueueSnackbar(`Created agent "${agent.name}"`, { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });

  const create = useMutation({
    mutationFn: () => {
      const agentIds = Object.fromEntries(
        template.aiNodes
          .map((n) => [n.nodeId, agentFor(n.nodeId, n.suggestedAgentTemplate)] as const)
          .filter(([, id]) => id),
      );
      return flowsApi.create({
        name: name.trim(),
        ...(template.key ? { templateKey: template.key, agentIds } : {}),
      });
    },
    onSuccess: (flow) => {
      void queryClient.invalidateQueries({ queryKey: flowKeys.all });
      if (flow.addedVariables?.length) {
        enqueueSnackbar(
          `Flow variables added for missing contact fields: ${flow.addedVariables.join(', ')}`,
          {
            variant: 'info',
          },
        );
      }
      void navigate(`/flows/${flow.id}`);
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="new-flow-title">
      <DialogTitle id="new-flow-title">{template.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Flow name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
          {template.aiNodes.map((node) => (
            <Stack key={node.nodeId} spacing={1}>
              <TextField
                select
                label={`AI agent for "${node.label}"`}
                value={agentFor(node.nodeId, node.suggestedAgentTemplate)}
                onChange={(e) => setPicked((p) => ({ ...p, [node.nodeId]: e.target.value }))}
                helperText="You can change it later in the builder."
                disabled={agents.isPending}
              >
                <MenuItem value="">Choose later</MenuItem>
                {rows.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name}
                    {a.isActive ? '' : ' (off)'}
                  </MenuItem>
                ))}
              </TextField>
              {node.suggestedAgentTemplate && (
                <Button
                  size="small"
                  sx={{ alignSelf: 'flex-start' }}
                  onClick={() => createAgent.mutate(node)}
                  disabled={createAgent.isPending}
                >
                  Create the matching agent
                </Button>
              )}
            </Stack>
          ))}
          {template.optionalFields.length > 0 && (
            <Alert severity="info">
              Uses the contact fields {template.optionalFields.join(', ')}. Missing ones become flow
              variables.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => create.mutate()}
          disabled={!name.trim() || create.isPending}
        >
          Create flow
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** `/flows/new` — pick a template (or blank), name it, choose agents. */
export function NewFlowPage() {
  const templates = useFlowTemplates();
  const canWrite = useCanWriteFlows();
  const [chosen, setChosen] = useState<FlowTemplate | null>(null);
  if (!canWrite) return <Navigate to="/flows" replace />;
  const cards = [...(templates.data ?? []), BLANK];

  return (
    <>
      <PageHeader
        title="New call flow"
        subtitle="Start from a ready-made flow or a blank canvas"
        actions={
          <Button component={RouterLink} to="/flows" startIcon={<ArrowBackOutlined />}>
            Back
          </Button>
        }
      />
      {templates.isError && <Alert severity="error">{getErrorMessage(templates.error)}</Alert>}
      <Grid container spacing={2}>
        {templates.isPending
          ? [0, 1, 2, 3].map((i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                <Skeleton variant="rounded" height={150} />
              </Grid>
            ))
          : cards.map((t) => (
              <Grid key={t.key || 'blank'} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardActionArea
                    onClick={() => setChosen(t)}
                    sx={{ height: '100%' }}
                    aria-label={t.title}
                  >
                    <CardContent>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                        <Typography variant="h6" component="h2">
                          {t.title}
                        </Typography>
                        {t.key && <Chip size="small" label={LANGUAGES[t.language]} />}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {t.description}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
      </Grid>
      {chosen && <CreateDialog template={chosen} onClose={() => setChosen(null)} />}
    </>
  );
}
