import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { DataTable } from '@/components/DataTable';
import { usePermission, useSession } from '@/features/auth/hooks';
import { useDispositions } from '@/features/insights/queries';
import { buildPreview } from '@/features/templates/preview';
import { useTemplate, useTemplates } from '@/features/templates/queries';
import { TemplatePreview } from '@/features/templates/TemplatePreview';
import { useChannels } from '@/features/whatsapp/queries';
import { getErrorMessage } from '@/services/api/errors';
import { outcomeRulesApi, type RuleParam } from '@/services/api/outcome-rules';
import type { OutcomeRule } from '@/services/api/types';

import { integrationKeys } from '../keys';

import {
  CALL_KEYS,
  draftOf,
  emptyDraft,
  INSIGHT_KEYS,
  inputOf,
  ruleProblem,
  sampleFor,
  SOURCE_LABELS,
  TIMING_LABELS,
  timingLabel,
  whenLabel,
  type RuleDraft,
} from './rules';

function RuleDialog({ rule, onClose }: { rule: OutcomeRule | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [d, setD] = useState<RuleDraft>(rule ? draftOf(rule) : emptyDraft());
  const [touched, setTouched] = useState(false);
  const channels = useChannels();
  const outcomes = useDispositions();
  const templates = useTemplates({ status: ['APPROVED'] });
  const template = useTemplate(d.templateId || null);
  const variables = template.data?.variables ?? [];
  const problem = ruleProblem(d, variables.length);
  const save = useMutation({
    mutationFn: () =>
      rule ? outcomeRulesApi.update(rule.id, inputOf(d)) : outcomeRulesApi.create(inputOf(d)),
    meta: { silent: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: integrationKeys.rules });
      enqueueSnackbar(rule ? 'Rule saved' : 'Rule added', { variant: 'success' });
      onClose();
    },
  });
  const setParam = (i: number, p: Partial<RuleParam>) => {
    setTouched(true);
    setD({
      ...d,
      params: variables.map((_v, j) => {
        const cur = d.params[j] ?? { from: 'contact' as const, key: null, value: null };
        return j === i ? { ...cur, ...p } : cur;
      }),
    });
  };
  const values = Object.fromEntries(
    variables.map((v, i) => [v.key, d.params[i] ? sampleFor(d.params[i]) : '']),
  );
  const toggle = <T,>(list: T[], item: T, on: boolean) =>
    on ? [...list, item] : list.filter((x) => x !== item);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="rule-title">
      <DialogTitle id="rule-title">
        {rule ? 'Change rule' : 'Add an after-the-call rule'}
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={3} sx={{ pt: 1 }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={2}>
              {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
              <TextField
                label="Name"
                value={d.name}
                onChange={(e) => {
                  setTouched(true);
                  setD({ ...d, name: e.target.value });
                }}
                slotProps={{ htmlInput: { maxLength: 80 } }}
              />
              <FormLabel component="legend">When the call ends with…</FormLabel>
              <TextField
                select
                label="Outcome (any if none chosen)"
                value={d.dispositions}
                onChange={(e) =>
                  setD({ ...d, dispositions: e.target.value as unknown as string[] })
                }
                slotProps={{ select: { multiple: true } }}
              >
                {(outcomes.data ?? []).map((o) => (
                  <MenuItem key={o.key} value={o.key}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {(['positive', 'neutral', 'negative'] as const).map((s) => (
                  <FormControlLabel
                    key={s}
                    control={
                      <Checkbox
                        checked={d.sentiment.includes(s)}
                        onChange={(e) =>
                          setD({ ...d, sentiment: toggle(d.sentiment, s, e.target.checked) })
                        }
                      />
                    }
                    label={`${s} customer`}
                  />
                ))}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  select
                  label="Promise to pay"
                  value={d.hasPromise}
                  onChange={(e) =>
                    setD({ ...d, hasPromise: e.target.value as RuleDraft['hasPromise'] })
                  }
                  sx={{ minWidth: 160 }}
                >
                  <MenuItem value="any">Any</MenuItem>
                  <MenuItem value="yes">Promise found</MenuItem>
                  <MenuItem value="no">No promise</MenuItem>
                </TextField>
                <TextField
                  type="number"
                  label="Not answered N times in a row"
                  value={d.notAnsweredInARow ?? ''}
                  onChange={(e) =>
                    setD({
                      ...d,
                      notAnsweredInARow: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  slotProps={{ htmlInput: { min: 1, max: 10 } }}
                />
              </Stack>
              <Stack direction="row" spacing={1}>
                {(['phone', 'whatsapp'] as const).map((k) => (
                  <FormControlLabel
                    key={k}
                    control={
                      <Checkbox
                        checked={d.callKinds.length === 0 || d.callKinds.includes(k)}
                        onChange={(e) => {
                          const base =
                            d.callKinds.length === 0 ? ['phone', 'whatsapp'] : d.callKinds;
                          const next = toggle(
                            base as ('phone' | 'whatsapp')[],
                            k,
                            e.target.checked,
                          );
                          setD({ ...d, callKinds: next.length === 2 ? [] : next });
                        }}
                      />
                    }
                    label={k === 'phone' ? 'Phone calls' : 'WhatsApp calls'}
                  />
                ))}
              </Stack>
              <FormLabel component="legend">…send this WhatsApp template</FormLabel>
              <TextField
                select
                label="From number"
                value={d.channelId ?? ''}
                onChange={(e) => setD({ ...d, channelId: e.target.value || null })}
                helperText="Empty = the account's only connected number"
              >
                <MenuItem value="">Default</MenuItem>
                {(channels.data?.items ?? []).map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.label} {c.displayPhoneNumber ?? ''}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Approved template"
                value={d.templateId}
                onChange={(e) => {
                  setTouched(true);
                  setD({ ...d, templateId: e.target.value, params: [] });
                }}
              >
                {(templates.data ?? []).map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name} ({t.language})
                  </MenuItem>
                ))}
              </TextField>
              {variables.map((v, i) => {
                const p = d.params[i] ?? { from: 'contact' as const, key: null, value: null };
                return (
                  <Stack key={v.key} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                      select
                      size="small"
                      label={`{{${v.key}}} from`}
                      value={p.from}
                      onChange={(e) =>
                        setParam(i, {
                          from: e.target.value as RuleParam['from'],
                          key: null,
                          value: null,
                        })
                      }
                      sx={{ minWidth: 170 }}
                    >
                      {Object.entries(SOURCE_LABELS).map(([k, label]) => (
                        <MenuItem key={k} value={k}>
                          {label}
                        </MenuItem>
                      ))}
                    </TextField>
                    {p.from === 'text' ? (
                      <TextField
                        size="small"
                        label="Text"
                        value={p.value ?? ''}
                        onChange={(e) => setParam(i, { value: e.target.value })}
                        slotProps={{ htmlInput: { maxLength: 200 } }}
                        fullWidth
                      />
                    ) : p.from === 'contact' ? (
                      <TextField
                        size="small"
                        label="Field key"
                        placeholder="name, due_date …"
                        value={p.key ?? ''}
                        onChange={(e) => setParam(i, { key: e.target.value.trim() || null })}
                        fullWidth
                      />
                    ) : (
                      <TextField
                        select
                        size="small"
                        label="Value"
                        value={p.key ?? ''}
                        onChange={(e) => setParam(i, { key: e.target.value })}
                        fullWidth
                      >
                        {(p.from === 'call' ? CALL_KEYS : INSIGHT_KEYS).map((k) => (
                          <MenuItem key={k} value={k}>
                            {k}
                          </MenuItem>
                        ))}
                      </TextField>
                    )}
                  </Stack>
                );
              })}
              <FormLabel component="legend">…at</FormLabel>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  select
                  label="When"
                  value={d.mode}
                  onChange={(e) => setD({ ...d, mode: e.target.value as RuleDraft['mode'] })}
                  sx={{ minWidth: 260 }}
                >
                  {Object.entries(TIMING_LABELS).map(([k, label]) => (
                    <MenuItem key={k} value={k}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
                {d.mode === 'after' && (
                  <TextField
                    type="number"
                    label="Minutes after the call"
                    value={d.delayMinutes ?? ''}
                    onChange={(e) =>
                      setD({ ...d, delayMinutes: e.target.value ? Number(e.target.value) : null })
                    }
                    slotProps={{ htmlInput: { min: 1, max: 1440 } }}
                  />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Sent once per call, charged like any template. Skipped (with the reason on the call
                page) for opted-out or do-not-call customers, unapproved templates, an empty wallet
                or the marketing limit.
              </Typography>
              {touched && problem && <FormHelperText error>{problem}</FormHelperText>}
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            {template.data ? (
              <TemplatePreview
                label="Preview with sample values"
                preview={buildPreview(template.data.components, template.data.parameterFormat, {
                  values,
                })}
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Choose a template to see a preview.
              </Typography>
            )}
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={Boolean(problem) || save.isPending}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Integrations → After the call: WhatsApp templates sent by outcome rules. */
export function AfterCallTab() {
  const session = useSession();
  const canManage = usePermission('integrations.manage') && !session?.impersonation;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ rule: OutcomeRule | null } | null>(null);
  const list = useQuery({
    queryKey: integrationKeys.rules,
    queryFn: outcomeRulesApi.list,
    meta: { silent: true },
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: integrationKeys.rules });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      outcomeRulesApi.update(id, { active }),
    meta: { silent: true },
    onSuccess: refresh,
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: 'error' }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => outcomeRulesApi.remove(id),
    meta: { silent: true },
    onSuccess: () => {
      refresh();
      enqueueSnackbar('Rule removed', { variant: 'success' });
    },
    onError: (e) => enqueueSnackbar(getErrorMessage(e), { variant: 'error' }),
  });
  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ justifyContent: 'space-between' }}
      >
        <Typography variant="body2" color="text.secondary">
          Send a WhatsApp template after a call, depending on how it went — for example a payment
          link after a promise to pay. Flows can also send one with a "Send WhatsApp" step.
        </Typography>
        {canManage && (
          <Button
            variant="contained"
            onClick={() => setEditing({ rule: null })}
            sx={{ flexShrink: 0 }}
          >
            Add rule
          </Button>
        )}
      </Stack>
      <DataTable<OutcomeRule>
        aria-label="After-the-call rules"
        columns={[
          { key: 'name', header: 'Rule', render: (r) => r.name },
          { key: 'when', header: 'When', render: (r) => whenLabel(r.when) },
          {
            key: 'send',
            header: 'Sends',
            render: (r) =>
              r.send.template
                ? `${r.send.template.name} (${r.send.template.language})`
                : 'Template removed',
          },
          { key: 'timing', header: 'At', render: (r) => timingLabel(r.timing) },
          {
            key: 'active',
            header: 'On',
            render: (r) => (
              <Switch
                checked={r.active}
                disabled={!canManage || toggle.isPending}
                onChange={(e) => toggle.mutate({ id: r.id, active: e.target.checked })}
                slotProps={{
                  input: { 'aria-label': r.active ? `Turn off ${r.name}` : `Turn on ${r.name}` },
                }}
              />
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) =>
              canManage ? (
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => setEditing({ rule: r })}>
                    Change
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() =>
                      void confirm({
                        title: `Remove "${r.name}"?`,
                        message: 'Messages it already scheduled are skipped.',
                        confirmText: 'Remove',
                        destructive: true,
                      }).then((ok) => {
                        if (ok) remove.mutate(r.id);
                      })
                    }
                  >
                    Remove
                  </Button>
                </Stack>
              ) : null,
          },
        ]}
        rows={list.data}
        getRowId={(r) => r.id}
        loading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        emptyTitle="No rules yet"
        emptyDescription="Add a rule to send a WhatsApp template after calls."
      />
      {editing && <RuleDialog rule={editing.rule} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
