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
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';

import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { agentKeys } from '@/features/agents/keys';
import { useAgentTemplates, useCanWriteAgents } from '@/features/agents/queries';
import { agentsApi } from '@/services/api/agents';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { AgentTemplate } from '@/services/api/types';

const BLANK: AgentTemplate = {
  key: '',
  title: 'Blank agent',
  summary: 'Start from scratch with the safety rules and default fallbacks only.',
  language: 'Any',
};

/** `/agents/new` — pick a template (or blank), name it, open the editor. */
export function NewAgentPage() {
  const canWrite = useCanWriteAgents();
  const templates = useAgentTemplates();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<AgentTemplate | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      agentsApi.create({ name: name.trim(), ...(picked?.key ? { templateKey: picked.key } : {}) }),
    onSuccess: (agent) => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.lists });
      void navigate(`/agents/${agent.id}/basic`);
    },
    onError: (err) => {
      const e = toApiError(err);
      setNameError(e.details.find((d) => d.path.endsWith('name'))?.message ?? getErrorMessage(err));
    },
  });

  const open = (t: AgentTemplate) => {
    setPicked(t);
    setName(t.key ? t.title : '');
    setNameError(null);
  };

  if (!canWrite) {
    return (
      <>
        <PageHeader title="New agent" />
        <EmptyState
          title="You can view agents but not create them"
          description="Ask an owner, admin or manager to create the agent."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New agent"
        subtitle="Pick a starting point — you can change everything afterwards"
        actions={
          <Button component={RouterLink} to="/agents" startIcon={<ArrowBackOutlined />}>
            All agents
          </Button>
        }
      />
      {templates.isError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={<Button onClick={() => void templates.refetch()}>Retry</Button>}
        >
          {getErrorMessage(templates.error)}
        </Alert>
      )}
      <Grid container spacing={2}>
        {(templates.data ?? []).concat(BLANK).map((t) => (
          <Grid key={t.key || 'blank'} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardActionArea
                onClick={() => open(t)}
                sx={{ height: '100%', alignItems: 'flex-start' }}
              >
                <CardContent>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle1" component="h2">
                      {t.title}
                    </Typography>
                    <Chip size="small" label={t.language} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {t.summary}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
        {templates.isPending &&
          [1, 2, 3].map((i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
              <Skeleton variant="rounded" height={120} />
            </Grid>
          ))}
      </Grid>

      <Dialog open={Boolean(picked)} onClose={() => setPicked(null)} fullWidth maxWidth="xs">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              setNameError('Enter a name');
              return;
            }
            create.mutate();
          }}
        >
          <DialogTitle>Name your agent</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Starting from: {picked?.title}
            </Typography>
            <TextField
              label="Agent name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              error={Boolean(nameError)}
              helperText={nameError ?? 'Only your team sees this name'}
              fullWidth
              autoFocus
              slotProps={{ htmlInput: { maxLength: 80 } }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPicked(null)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={create.isPending}>
              Create
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
