import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  LinearProgress,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router';

import { usePermission, useSession } from '@/features/auth/hooks';
import {
  useListOptions,
  useSegments,
  useContactTags,
  useCustomFields,
} from '@/features/contacts/queries';
import { templateKeys } from '@/features/templates/keys';
import { buildPreview } from '@/features/templates/preview';
import { useTemplate, useTemplates } from '@/features/templates/queries';
import { TemplatePreview } from '@/features/templates/TemplatePreview';
import { headerFormat } from '@/features/templates/variables';
import { useChannels } from '@/features/whatsapp/queries';
import { contactImportsApi } from '@/services/api/contact-imports';
import { contactsApi } from '@/services/api/contacts';
import { getErrorMessage } from '@/services/api/errors';
import { inboxApi } from '@/services/api/inbox';
import { templatesApi } from '@/services/api/templates';
import type { WhatsAppCampaignEstimate, WhatsAppTemplateListItem } from '@/services/api/types';
import { formatCurrencyMicros } from '@/utils/format';

import type { VariableKind, WaWizardDraft } from './draft';
import { VARIANT_KEYS, WA_VARIABLE_KIND_LABELS } from './labels';

export interface StepProps {
  draft: WaWizardDraft;
  onChange: (patch: Partial<WaWizardDraft>) => void;
}

const templateLabel = (t: WhatsAppTemplateListItem) => `${t.name} (${t.category})`;

/** Step 0 — name + the WhatsApp number. */
export function NumberStep({ draft, onChange }: StepProps) {
  const channels = useChannels();
  const items = channels.data?.items ?? [];
  return (
    <Stack spacing={2}>
      <TextField
        label="Campaign name"
        value={draft.name}
        required
        onChange={(e) => onChange({ name: e.target.value })}
        slotProps={{ htmlInput: { maxLength: 120 } }}
      />
      <TextField
        select
        label="WhatsApp number"
        value={draft.channelId}
        onChange={(e) =>
          // changing the number drops the templates / variables (they belong to a number)
          onChange({
            channelId: e.target.value,
            variants: [{ key: 'A', templateId: '', splitPct: 100 }],
            abWinner: null,
            variables: {},
            headerMediaToken: null,
            headerLocation: null,
          })
        }
      >
        {items
          .filter((c) => c.status === 'connected')
          .map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.displayPhoneNumber ?? c.phoneE164 ?? c.label}
              {c.status !== 'connected' ? ` · ${c.status}` : ''}
            </MenuItem>
          ))}
      </TextField>
      {items.find((c) => c.id === draft.channelId) && (
        <Typography variant="body2">
          Up to {items.find((c) => c.id === draft.channelId)?.messageRateLimit ?? 18} messages/sec
          on this number; daily messaging limits still apply. Refresh number settings if
          classification is unknown.
        </Typography>
      )}
      {items.length === 0 && (
        <Alert severity="info">No WhatsApp number yet — connect one first.</Alert>
      )}
    </Stack>
  );
}

/** Step 1 — one to three approved templates, optional A/B split + winner metric. */
export function TemplateStep({ draft, onChange }: StepProps) {
  const templates = useTemplates(
    { channelId: draft.channelId || undefined },
    Boolean(draft.channelId),
  );
  const rows = (templates.data ?? []).filter((t) => t.status === 'APPROVED');
  const addVariant = () => {
    const nextKey = VARIANT_KEYS.find((key) => !draft.variants.some((v) => v.key === key));
    if (!nextKey) return;
    const share = Math.floor(100 / (draft.variants.length + 1));
    onChange({
      variants: [
        ...draft.variants.map((v, i) => ({
          ...v,
          splitPct: i === 0 ? 100 - share * draft.variants.length : share,
        })),
        { key: nextKey, templateId: '', splitPct: share },
      ],
      abWinner: draft.abWinner ?? { metric: 'read', afterHours: 6 },
    });
  };
  const setVariant = (i: number, patch: Partial<WaWizardDraft['variants'][number]>) => {
    const variants = draft.variants.map((v, j) => (j === i ? { ...v, ...patch } : v));
    onChange({
      variants,
      ...(patch.templateId !== undefined ? { variables: {}, headerMediaToken: null } : {}),
    });
  };
  const removeVariant = (i: number) =>
    onChange({
      variants: draft.variants
        .filter((_, j) => j !== i)
        .map((v, j, all) => ({
          ...v,
          splitPct:
            j === 0
              ? 100 - Math.floor(100 / all.length) * (all.length - 1)
              : Math.floor(100 / all.length),
        })),
      abWinner: draft.variants.length > 2 ? draft.abWinner : null,
      variables: {},
    });
  const sum = draft.variants.reduce((a, v) => a + v.splitPct, 0);
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2">
        Message variants (approved templates only; {String(rows.length)} available on this number)
      </Typography>
      {draft.variants.map((v, i) => (
        <Stack
          key={v.key}
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ alignItems: { sm: 'center' } }}
        >
          <Chip label={`Variant ${v.key}`} size="small" sx={{ width: 90 }} />
          <TextField
            select
            label="Template"
            value={v.templateId}
            onChange={(e) => setVariant(i, { templateId: e.target.value })}
            sx={{ minWidth: 260 }}
          >
            {rows.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {templateLabel(t)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Share %"
            type="number"
            value={v.splitPct}
            onChange={(e) => setVariant(i, { splitPct: Number(e.target.value) })}
            slotProps={{ htmlInput: { min: 1, max: 100 } }}
            sx={{ width: 120 }}
            disabled={draft.variants.length === 1}
          />
          {draft.variants.length > 1 && (
            <Button onClick={() => removeVariant(i)} sx={{ ml: 1 }}>
              Remove
            </Button>
          )}
        </Stack>
      ))}
      {draft.variants
        .filter((v) => v.templateId)
        .map((v) => (
          <TemplateSample key={v.key} id={v.templateId} label={`Variant ${v.key} preview`} />
        ))}
      {draft.variants.length < VARIANT_KEYS.length && (
        <Button variant="outlined" onClick={addVariant} sx={{ alignSelf: 'flex-start' }}>
          Add variant
        </Button>
      )}
      {draft.variants.length > 1 && sum !== 100 && (
        <Alert severity="error">The splits must add up to 100 % (now {sum} %).</Alert>
      )}
      {draft.variants.length > 1 && (
        <>
          <Divider />
          <Typography variant="subtitle2">
            Which variant wins the rest (after a few hours)?
          </Typography>
          <ToggleButtonGroup
            value={draft.abWinner?.metric}
            exclusive
            size="small"
            onChange={(_e, metric) =>
              onChange({
                abWinner: metric ? { metric: metric as 'read' | 'reply', afterHours: 6 } : null,
              })
            }
          >
            <ToggleButton value="read">Most read</ToggleButton>
            <ToggleButton value="reply">Most replied</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            label="Wait (hours)"
            type="number"
            value={draft.abWinner?.afterHours ?? 6}
            onChange={(e) =>
              onChange({
                abWinner: {
                  metric: draft.abWinner?.metric ?? 'read',
                  afterHours: Number(e.target.value),
                },
              })
            }
            slotProps={{ htmlInput: { min: 1, max: 72 } }}
            sx={{ width: 160 }}
          />
        </>
      )}
    </Stack>
  );
}

/** Step 2 — where each template variable's value comes from (per variant). */
export function VariablesStep({ draft, onChange }: StepProps) {
  const sample = useQuery({
    queryKey: ['whatsapp-campaigns', 'sample-contact', draft.contactIds[0]],
    queryFn: () =>
      draft.contactIds[0]
        ? contactsApi.get(draft.contactIds[0])
        : contactsApi.list({ limit: 1 }).then((p) => p.data[0]),
  });
  const fields = useCustomFields();
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const kind = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : 'document';
      return inboxApi.upload({ file, fileName: file.name, kind });
    },
    meta: { silent: true },
    onSuccess: (u) => onChange({ headerMediaToken: u.mediaToken }),
  });
  const selected = draft.variants.filter((v) => v.templateId);
  const templateQueries = useQueries({
    queries: selected.map((v) => ({
      queryKey: templateKeys.detail(v.templateId),
      queryFn: () => templatesApi.get(v.templateId),
      enabled: Boolean(v.templateId),
    })),
  });
  const setVar = (key: string, patch: Partial<{ kind: VariableKind; value: string | null }>) => {
    const existing = draft.variables[key] ?? { kind: 'static', value: null };
    const variables = { ...draft.variables, [key]: { ...existing, ...patch } };
    onChange({ variables });
  };
  if (!selected.length)
    return (
      <Alert severity="info">
        Pick a template for a variant first — the variables appear here.
      </Alert>
    );
  return (
    <Stack spacing={3}>
      {selected.map((v, i) => {
        const template = templateQueries[i]?.data;
        if (templateQueries[i]?.error)
          return (
            <Alert key={v.key} severity="error">
              {getErrorMessage(templateQueries[i].error)}
            </Alert>
          );
        if (!template)
          return (
            <LinearProgress key={v.key} variant="indeterminate" aria-label={`Loading ${v.key}`} />
          );
        const vars = template.variables ?? [];
        return (
          <Box key={v.key}>
            <Typography variant="subtitle2" gutterBottom>
              Variant {v.key} · {template.name}
            </Typography>
            {vars.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                This template has no variables.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {vars.map((varr) => (
                  <Stack
                    key={varr.key}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    sx={{ alignItems: { sm: 'center' } }}
                  >
                    <Typography variant="body2" sx={{ minWidth: 160 }}>
                      {varr.key}
                    </Typography>
                    <TextField
                      select
                      label="Source"
                      value={draft.variables[varr.key]?.kind ?? ''}
                      onChange={(e) =>
                        setVar(varr.key, {
                          kind: e.target.value as VariableKind,
                          value: null,
                        })
                      }
                      sx={{ minWidth: 180 }}
                    >
                      <MenuItem value="" disabled>
                        Choose a source
                      </MenuItem>
                      {Object.entries(WA_VARIABLE_KIND_LABELS).map(([k, label]) => (
                        <MenuItem key={k} value={k}>
                          {label}
                        </MenuItem>
                      ))}
                    </TextField>
                    {(draft.variables[varr.key]?.kind === 'static' ||
                      draft.variables[varr.key]?.kind === 'field') && (
                      <TextField
                        select={draft.variables[varr.key]?.kind === 'field'}
                        label={draft.variables[varr.key]?.kind === 'field' ? 'Field' : 'Text'}
                        value={draft.variables[varr.key]?.value ?? ''}
                        onChange={(e) => setVar(varr.key, { value: e.target.value })}
                        sx={{ minWidth: 160 }}
                      >
                        {draft.variables[varr.key]?.kind === 'field' &&
                          (fields.data ?? []).map((f) => (
                            <MenuItem key={f.key} value={f.key}>
                              {f.label}
                            </MenuItem>
                          ))}
                      </TextField>
                    )}
                  </Stack>
                ))}
              </Stack>
            )}
            <TemplatePreview
              label={`Variant ${v.key} sample`}
              preview={buildPreview(template.components, template.parameterFormat, {
                values: Object.fromEntries(
                  Object.entries(draft.variables).map(([key, source]) => [
                    key,
                    source.kind === 'contact.name'
                      ? (sample.data?.name ?? 'Sample contact')
                      : source.kind === 'contact.phone'
                        ? (sample.data?.phoneE164 ?? 'Sample phone')
                        : source.kind === 'field'
                          ? String(
                              sample.data?.variables[source.value ?? ''] ??
                                `[${source.value ?? 'field'}]`,
                            )
                          : (source.value ?? ''),
                  ]),
                ),
              })}
            />
          </Box>
        );
      })}
      {templateQueries.some((t) => t.data && headerFormat(t.data.components) === 'LOCATION') && (
        <Stack spacing={1}>
          <Typography variant="subtitle2">Header location</Typography>
          <TextField
            label="Latitude"
            type="number"
            value={draft.headerLocation?.latitude ?? ''}
            onChange={(e) =>
              onChange({
                headerLocation: {
                  latitude: Number(e.target.value),
                  longitude: draft.headerLocation?.longitude ?? 0,
                },
              })
            }
          />
          <TextField
            label="Longitude"
            type="number"
            value={draft.headerLocation?.longitude ?? ''}
            onChange={(e) =>
              onChange({
                headerLocation: {
                  longitude: Number(e.target.value),
                  latitude: draft.headerLocation?.latitude ?? 0,
                },
              })
            }
          />
        </Stack>
      )}
      {templateQueries.some(
        (t) => t.data && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat(t.data.components)),
      ) && (
        <Stack spacing={1}>
          <Typography variant="subtitle2">Header media</Typography>
          <Typography variant="body2">
            Use the template example, or upload a campaign file. All variants must use the same
            media type.
          </Typography>
          <Button component="label" disabled={upload.isPending}>
            Upload campaign header
            <input
              hidden
              type="file"
              accept="image/*,video/mp4,application/pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
              }}
            />
          </Button>
          {upload.isPending && <LinearProgress aria-label="Uploading header" />}
          {upload.error && <Alert severity="error">{getErrorMessage(upload.error)}</Alert>}
          {draft.headerMediaToken && <Alert severity="success">Campaign header uploaded</Alert>}
          <Button onClick={() => onChange({ headerMediaToken: null })}>Use template example</Button>
        </Stack>
      )}
      {fields.data && (
        <Typography variant="caption" color="text.secondary">
          Contact fields: {(fields.data ?? []).map((f) => f.label).join(', ') || 'none yet'}
        </Typography>
      )}
    </Stack>
  );
}

const AUDIENCE_MODES: { value: WaWizardDraft['audienceMode']; label: string }[] = [
  { value: 'lists', label: 'Lists' },
  { value: 'segment', label: 'Segment' },
  { value: 'tags', label: 'Tags' },
  { value: 'csv', label: 'CSV upload' },
  { value: 'pick', label: 'Picked contacts' },
];

/** Step 3 — who gets the message + skip recently-sent. */
export function AudienceStep({ draft, onChange }: StepProps) {
  const lists = useListOptions();
  const segments = useSegments(true);
  const tags = useContactTags();
  const imports = useQuery({
    queryKey: ['contact-imports', 'csv'],
    queryFn: () => contactImportsApi.list({ kind: 'contacts', status: 'completed', limit: 25 }),
  });
  const num = (v: string) => (v === '' ? 0 : Math.trunc(Number(v)));
  return (
    <Stack spacing={3}>
      <RadioGroup
        row
        value={draft.audienceMode}
        onChange={(e) =>
          onChange({ audienceMode: e.target.value as WaWizardDraft['audienceMode'] })
        }
        aria-label="Audience"
      >
        {AUDIENCE_MODES.map((m) => (
          <FormControlLabel key={m.value} value={m.value} control={<Radio />} label={m.label} />
        ))}
      </RadioGroup>
      {draft.audienceMode === 'lists' && (
        <TextField
          select
          label="Lists"
          value={draft.listIds}
          onChange={(e) => onChange({ listIds: (e.target.value as unknown as string[]) || [] })}
          slotProps={{ select: { multiple: true } }}
          sx={{ minWidth: 280 }}
        >
          {(lists.data ?? []).map((l) => (
            <MenuItem key={l.id} value={l.id}>
              {l.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      {draft.audienceMode === 'segment' && (
        <TextField
          select
          label="Segment"
          value={draft.segmentId ?? ''}
          onChange={(e) => onChange({ segmentId: e.target.value || null })}
          sx={{ minWidth: 280 }}
        >
          <MenuItem value="">None</MenuItem>
          {(segments.data ?? []).map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      {draft.audienceMode === 'tags' && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            label="Tags"
            value={draft.tagValues}
            onChange={(e) => onChange({ tagValues: (e.target.value as unknown as string[]) || [] })}
            slotProps={{ select: { multiple: true } }}
            sx={{ minWidth: 240 }}
          >
            {(tags.data ?? []).map((t) => (
              <MenuItem key={t.tag} value={t.tag}>
                {t.tag}
              </MenuItem>
            ))}
          </TextField>
          <ToggleButtonGroup
            value={draft.tagMode}
            exclusive
            size="small"
            onChange={(_e, mode) => {
              if (mode) onChange({ tagMode: mode as 'any' | 'all' });
            }}
          >
            <ToggleButton value="any">Any of</ToggleButton>
            <ToggleButton value="all">All of</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      )}
      {draft.audienceMode === 'csv' && (
        <Stack spacing={1}>
          <Button component={RouterLink} to="/contacts/imports/new" target="_blank">
            Upload and import contacts
          </Button>
          <TextField
            select
            label="Import"
            value={draft.csvUploadId ?? ''}
            onChange={(e) => onChange({ csvUploadId: e.target.value || null })}
            sx={{ minWidth: 320 }}
          >
            <MenuItem value="">Choose an import…</MenuItem>
            {(imports.data?.data ?? []).map((j) => (
              <MenuItem key={j.id} value={j.id}>
                {j.fileName} · {String(j.rowCount)} rows
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      )}
      {draft.audienceMode === 'pick' && (
        <Alert severity="info">
          Picked contacts arrive from the page you came in on ({String(draft.contactIds.length)}{' '}
          preselected). Start the wizard from a contacts selection to choose them.
        </Alert>
      )}
      <Divider />
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'center' } }}
      >
        <TextField
          label="Skip if the same template went out within (days)"
          type="number"
          value={draft.excludeRecentDays}
          onChange={(e) => onChange({ excludeRecentDays: num(e.target.value) })}
          slotProps={{ htmlInput: { min: 0, max: 90 } }}
          sx={{ minWidth: 260 }}
        />
      </Stack>
    </Stack>
  );
}

/** Step 4 — start now or at a time. */
export function ScheduleStep({ draft, onChange }: StepProps) {
  const toLocal = (iso: string | null | undefined) =>
    iso
      ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16)
      : '';
  const fromLocal = (v: string) =>
    v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
  return (
    <Stack spacing={2}>
      <RadioGroup
        row
        value={draft.scheduleMode}
        onChange={(e) =>
          onChange({ scheduleMode: e.target.value as WaWizardDraft['scheduleMode'] })
        }
        aria-label="When"
      >
        <FormControlLabel value="now" control={<Radio />} label="Start now" />
        <FormControlLabel value="at" control={<Radio />} label="Later" />
        <FormControlLabel value="recurring" control={<Radio />} label="Recurring" />
      </RadioGroup>
      {draft.scheduleMode === 'recurring' && (
        <Stack spacing={2}>
          <TextField
            select
            label="Repeat"
            value={draft.recurrence.freq}
            onChange={(e) =>
              onChange({
                recurrence: { ...draft.recurrence, freq: e.target.value as 'daily' | 'weekly' },
              })
            }
          >
            <MenuItem value="daily">Daily</MenuItem>
            <MenuItem value="weekly">Weekly</MenuItem>
          </TextField>
          {draft.recurrence.freq === 'weekly' && (
            <TextField
              select
              label="Weekdays"
              value={draft.recurrence.days}
              slotProps={{ select: { multiple: true } }}
              onChange={(e) =>
                onChange({
                  recurrence: { ...draft.recurrence, days: e.target.value as unknown as number[] },
                })
              }
            >
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                (day, index) => (
                  <MenuItem key={day} value={index}>
                    {day}
                  </MenuItem>
                ),
              )}
            </TextField>
          )}
          <TextField
            label="Recurring time"
            type="time"
            value={draft.recurrence.time}
            onChange={(e) =>
              onChange({ recurrence: { ...draft.recurrence, time: e.target.value } })
            }
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Timezone"
            value={draft.timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
          />
          <TextField
            label="Repeat until (optional)"
            type="datetime-local"
            value={toLocal(draft.recurrence.until)}
            onChange={(e) =>
              onChange({ recurrence: { ...draft.recurrence, until: fromLocal(e.target.value) } })
            }
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      )}
      {draft.scheduleMode === 'at' && (
        <TextField
          label="Start at"
          type="datetime-local"
          value={toLocal(draft.scheduleAt)}
          onChange={(e) => onChange({ scheduleAt: fromLocal(e.target.value) })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ maxWidth: 320 }}
        />
      )}
    </Stack>
  );
}

/** Step 5 — cost preview + the Start button (one Idempotency-Key per attempt). */
export interface ReviewStepProps extends StepProps {
  estimate?: { data?: WhatsAppCampaignEstimate; isPending: boolean; error: unknown };
  onStart: () => void;
  starting: boolean;
  startError: unknown;
  canRun: boolean;
}

export function ReviewStep({
  draft,
  estimate,
  onStart,
  starting,
  startError,
  canRun,
}: ReviewStepProps) {
  const session = useSession();
  const canTopUp = usePermission('wallet.topup') && !session?.impersonation;
  const e = estimate?.data;
  const wallet = e?.walletAvailableMicros ?? 0;
  const short = e !== undefined && wallet < e.totalMicros;
  const audience =
    draft.audienceMode === 'lists'
      ? `${String(draft.listIds.length)} list(s)`
      : draft.audienceMode === 'segment'
        ? 'a segment'
        : draft.audienceMode === 'tags'
          ? `${String(draft.tagValues.length)} tag(s)`
          : draft.audienceMode === 'csv'
            ? 'a CSV import'
            : `${String(draft.contactIds.length)} picked contact(s)`;
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2">
        {draft.variants.map((v) => v.key).join(' / ')} → {audience}
        {draft.scheduleMode === 'recurring'
          ? ' · recurring'
          : draft.scheduleMode === 'at' && draft.scheduleAt
            ? ' · scheduled'
            : ' · now'}
      </Typography>
      {estimate?.isPending && <LinearProgress variant="indeterminate" aria-label="Estimating" />}
      {estimate?.error ? <Alert severity="error">{getErrorMessage(estimate.error)}</Alert> : null}
      {e && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 6 }}>
            <Typography variant="body2" color="text.secondary">
              Estimate
            </Typography>
            <Typography variant="h6">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
                e.totalMicros / 1_000_000,
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {String(e.recipients)} recipients · {e.byMarket.length} market(s)
            </Typography>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <Typography variant="body2" color="text.secondary">
              Wallet available
            </Typography>
            <Typography variant="h6">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(
                wallet / 1_000_000,
              )}
            </Typography>
          </Grid>
        </Grid>
      )}
      {e && (
        <>
          <Typography variant="body2">{e.note}</Typography>
          {Object.entries(e.skipped).map(([reason, count]) => (
            <Typography key={reason}>
              Skipped · {reason}: {count}
            </Typography>
          ))}
          {e.byMarket.map((m) => (
            <Typography key={`${m.market}-${m.category}`} variant="body2">
              {m.market} ({m.category}): {m.count} × {formatCurrencyMicros(m.priceMicros)} ={' '}
              {formatCurrencyMicros(m.count * m.priceMicros)}
            </Typography>
          ))}
          <LinearProgress
            aria-label="Wallet coverage"
            variant="determinate"
            value={
              e.totalMicros > 0 ? Math.max(0, Math.min(100, (wallet / e.totalMicros) * 100)) : 100
            }
          />
          {e.recipients === 0 && (
            <Alert severity="warning">
              This audience has no contacts. Go back and choose another audience.
            </Alert>
          )}
        </>
      )}
      {short && (
        <Alert severity="warning">
          Not enough credit to start.{' '}
          {session?.account.parentAccountId
            ? 'Contact your reseller to add credit, or check your wallet for top-up options.'
            : 'Add credit first.'}
          {canTopUp && !session?.account.parentAccountId && (
            <Button component={RouterLink} to="/wallet">
              Add credit
            </Button>
          )}
        </Alert>
      )}
      <Divider />
      {startError ? <Alert severity="error">{getErrorMessage(startError)}</Alert> : null}
      <Box sx={{ textAlign: 'right' }}>
        <Button
          variant="contained"
          onClick={onStart}
          disabled={
            !canRun ||
            starting ||
            !draft.channelId ||
            !e ||
            !e.enough ||
            !e.recipients ||
            Boolean(estimate?.error) ||
            Boolean(estimate?.isPending)
          }
          size="large"
        >
          {starting ? 'Starting…' : 'Start campaign'}
        </Button>
      </Box>
    </Stack>
  );
}

function TemplateSample({ id, label }: { id: string; label: string }) {
  const template = useTemplate(id);
  if (template.error) return <Alert severity="error">{getErrorMessage(template.error)}</Alert>;
  if (!template.data) return <LinearProgress aria-label="Loading preview" />;
  return (
    <TemplatePreview
      label={label}
      preview={buildPreview(template.data.components, template.data.parameterFormat, {
        headerFileName: template.data.headerMedia?.fileName,
      })}
    />
  );
}
