import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import type { EditorTabProps } from '@/features/agents/editor/editor-context';
import { agentsApi } from '@/services/api/agents';
import { getErrorMessage, toApiError } from '@/services/api/errors';

import { useKnowledgeBases } from './queries';

/** Agent → Knowledge: which bases it answers from and how strict the match is. */
export function KnowledgeTab({ agent, catalog, readOnly, onAgentChange }: EditorTabProps) {
  const bases = useKnowledgeBases();
  const [ids, setIds] = useState<string[]>(agent.knowledge.knowledgeBaseIds);
  const [topK, setTopK] = useState(agent.knowledge.topK);
  const [minScore, setMinScore] = useState(agent.knowledge.minScoreHundredths);
  const max = catalog?.limits.kbPerAgent ?? 3;
  const dirty =
    JSON.stringify(ids) !== JSON.stringify(agent.knowledge.knowledgeBaseIds) ||
    topK !== agent.knowledge.topK ||
    minScore !== agent.knowledge.minScoreHundredths;
  const byId = new Map((bases.data ?? []).map((b) => [b.id, b]));
  const save = useMutation({
    mutationFn: () =>
      agentsApi.update(agent.id, {
        knowledge: { knowledgeBaseIds: ids, topK, minScoreHundredths: minScore },
      }),
    onSuccess: (next) => {
      onAgentChange(next);
      enqueueSnackbar('Knowledge settings saved', { variant: 'success' });
    },
    onError: (err) =>
      enqueueSnackbar(toApiError(err).details[0]?.message ?? getErrorMessage(err), {
        variant: 'error',
      }),
  });

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ justifyContent: 'space-between', gap: 1 }}
        >
          <div>
            <Typography variant="subtitle1" component="h2">
              Knowledge
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The agent answers factual questions from these documents (up to {max} knowledge
              bases).
            </Typography>
          </div>
          <Link component={RouterLink} to="/knowledge">
            Manage knowledge
          </Link>
        </Stack>
        {bases.isError && (
          <Alert
            severity="error"
            action={<Button onClick={() => void bases.refetch()}>Retry</Button>}
          >
            {getErrorMessage(bases.error)}
          </Alert>
        )}
        <Autocomplete
          multiple
          options={(bases.data ?? []).map((b) => b.id)}
          value={ids}
          onChange={(_e, v) => setIds(v.slice(0, max))}
          getOptionLabel={(id) => byId.get(id)?.name ?? 'Deleted knowledge base'}
          getOptionDisabled={(id) => ids.length >= max && !ids.includes(id)}
          renderOption={(props, id) => {
            const b = byId.get(id);
            const { key, ...rest } = props;
            return (
              <li key={key} {...rest}>
                <Stack>
                  <span>{b?.name}</span>
                  <Typography variant="caption" color="text.secondary">
                    {b?.sourcesCount} sources · {b?.chunksCount} pieces
                    {b?.status === 'stale' ? ' · needs re-index' : ''}
                  </Typography>
                </Stack>
              </li>
            );
          }}
          renderValue={(value, getItemProps) =>
            value.map((id, index) => {
              const { key, ...rest } = getItemProps({ index });
              const b = byId.get(id);
              return (
                <Chip
                  key={key}
                  size="small"
                  label={`${b?.name ?? 'Deleted'} (${b?.sourcesCount ?? 0})`}
                  color={b?.status === 'stale' ? 'warning' : 'default'}
                  {...rest}
                />
              );
            })
          }
          loading={bases.isPending}
          disabled={readOnly}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Knowledge bases"
              helperText={
                bases.data?.length === 0
                  ? 'No knowledge bases yet — create one under Knowledge'
                  : undefined
              }
            />
          )}
        />
        <div>
          <Typography id="topk-label" variant="body2">
            Pieces per answer: {topK}
          </Typography>
          <Slider
            aria-labelledby="topk-label"
            value={topK}
            onChange={(_e, v) => setTopK(v)}
            min={1}
            max={8}
            step={1}
            marks
            disabled={readOnly}
            sx={{ maxWidth: 360 }}
          />
        </div>
        <div>
          <Typography id="minscore-label" variant="body2">
            Minimum match: {(minScore / 100).toFixed(2)}
          </Typography>
          <Slider
            aria-labelledby="minscore-label"
            value={minScore}
            onChange={(_e, v) => setMinScore(v)}
            min={0}
            max={100}
            step={5}
            disabled={readOnly}
            sx={{ maxWidth: 360 }}
          />
          <Typography variant="caption" color="text.secondary">
            Higher = only close matches are used; lower = more pieces, more noise.
          </Typography>
        </div>
        {!readOnly && (
          <div>
            <Button
              variant="contained"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              Save knowledge settings
            </Button>
          </div>
        )}
      </Stack>
    </Paper>
  );
}
