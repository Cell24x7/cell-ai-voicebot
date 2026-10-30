import AddOutlined from '@mui/icons-material/AddOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { DataTable, type Column } from '@/components/DataTable';
import { agentsApi } from '@/services/api/agents';
import { getErrorMessage } from '@/services/api/errors';
import type { Agent, AgentFunction } from '@/services/api/types';

import type { EditorTabProps } from '../editor/editor-context';
import { agentKeys } from '../keys';

import { BuiltInToolsSection } from './BuiltInToolsSection';
import { hostOf } from './function-draft';
import { FunctionDialog } from './FunctionDialog';
import { FunctionTestDialog } from './FunctionTestDialog';

/** Functions tab: the client's APIs as tools + built-in tools. */
export function FunctionsTab({ agent, catalog, readOnly, onAgentChange }: EditorTabProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<AgentFunction | 'new' | null>(null);
  const [testing, setTesting] = useState<AgentFunction | null>(null);
  const max = catalog?.limits.functionsPerAgent ?? 10;

  const adopt = (next: Agent) => {
    onAgentChange(next);
    void queryClient.invalidateQueries({ queryKey: agentKeys.lists });
  };
  const remove = useMutation({
    mutationFn: (fn: AgentFunction) => agentsApi.deleteFunction(agent.id, fn.id),
    onSuccess: (next) => {
      adopt(next);
      enqueueSnackbar('Function removed', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const askRemove = async (fn: AgentFunction) => {
    if (
      await confirm({
        title: `Remove ${fn.name}?`,
        message: 'The AI can no longer call this API.',
        confirmText: 'Remove',
        destructive: true,
      })
    ) {
      remove.mutate(fn);
    }
  };

  const columns: Column<AgentFunction>[] = [
    {
      key: 'name',
      header: 'Function',
      render: (f) => (
        <div>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {f.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {f.description}
          </Typography>
        </div>
      ),
    },
    {
      key: 'request',
      header: 'Request',
      render: (f) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Chip size="small" label={f.method} />
          <span>{hostOf(f.url)}</span>
        </Stack>
      ),
    },
    { key: 'params', header: 'Parameters', align: 'right', render: (f) => f.parameters.length },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (f) =>
        readOnly ? null : (
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => setTesting(f)} aria-label={`Test ${f.name}`}>
              Test
            </Button>
            <Button size="small" onClick={() => setEditing(f)} aria-label={`Edit ${f.name}`}>
              Edit
            </Button>
            <Button
              size="small"
              color="error"
              onClick={() => void askRemove(f)}
              aria-label={`Remove ${f.name}`}
            >
              Delete
            </Button>
          </Stack>
        ),
    },
  ];

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{ justifyContent: 'space-between', gap: 1 }}
          >
            <div>
              <Typography variant="subtitle1" component="h2">
                Your APIs
              </Typography>
              <Typography variant="body2" color="text.secondary">
                The AI can call these during a conversation, e.g. to check a payment (up to {max}).
              </Typography>
            </div>
            {!readOnly && (
              <div>
                <Button
                  startIcon={<AddOutlined />}
                  variant="outlined"
                  onClick={() => setEditing('new')}
                  disabled={agent.functions.length >= max}
                >
                  Add function
                </Button>
              </div>
            )}
          </Stack>
          <DataTable
            aria-label="Functions"
            columns={columns}
            rows={agent.functions}
            getRowId={(f) => f.id}
            emptyTitle="No functions yet"
            emptyDescription="Add one to let the AI look things up in your systems."
          />
        </Stack>
      </Paper>
      <BuiltInToolsSection
        key={agent.updatedAt}
        agent={agent}
        readOnly={readOnly}
        onSaved={adopt}
      />
      {editing && (
        <FunctionDialog
          agent={agent}
          fn={editing === 'new' ? null : editing}
          variables={catalog?.variables ?? []}
          open
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            adopt(next);
            setEditing(null);
            enqueueSnackbar('Function saved', { variant: 'success' });
          }}
        />
      )}
      {testing && (
        <FunctionTestDialog agent={agent} fn={testing} open onClose={() => setTesting(null)} />
      )}
    </Stack>
  );
}
