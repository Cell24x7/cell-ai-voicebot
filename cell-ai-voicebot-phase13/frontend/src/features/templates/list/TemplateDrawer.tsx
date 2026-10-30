import Close from '@mui/icons-material/Close';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';
import { useState, type ReactNode } from 'react';

import { RelativeTime } from '@/components/RelativeTime';
import { useCustomFields } from '@/features/contacts/queries';
import { toApiError } from '@/services/api/errors';
import type { DeleteScope } from '@/services/api/templates';
import type {
  WhatsAppTemplate,
  WhatsAppTemplateVariable,
  WhatsAppVariableSourceKind,
} from '@/services/api/types';
import { formatNumber } from '@/utils/format';

import { languageLabel, reasonText, templateErrorMessage, VARIABLE_SOURCE_LABELS } from '../labels';
import { TEMPLATE_LIMITS } from '../limits';
import { buildPreview } from '../preview';
import {
  useDeleteTemplate,
  useSetVariableSources,
  useSubmitTemplate,
  useTemplate,
} from '../queries';
import { TemplatePreview } from '../TemplatePreview';
import { sampleValues } from '../variables';

import { CategoryChip, QualityDot, TemplateStatusChip } from './chips';

const WHATSAPP_MANAGER_URL = 'https://business.facebook.com/wa/manage/message-templates/';
const EDITABLE = ['DRAFT', 'APPROVED', 'REJECTED', 'PAUSED'];
const SOURCE_KINDS = Object.keys(VARIABLE_SOURCE_LABELS) as WhatsAppVariableSourceKind[];
const HISTORY_SOURCE = { user: 'by your team', webhook: 'by WhatsApp', sync: 'by a sync' } as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack spacing={1} component="section" aria-label={title}>
      <Typography variant="subtitle2">{title}</Typography>
      {children}
    </Stack>
  );
}

function VariableDefaults({
  template,
  canManage,
}: {
  template: WhatsAppTemplate;
  canManage: boolean;
}) {
  const fields = useCustomFields();
  const save = useSetVariableSources();
  const [sources, setSources] = useState(() =>
    Object.fromEntries(template.variables.map((v) => [v.key, v.defaultSource])),
  );
  if (!template.variables.length) return null;
  const label = (v: WhatsAppTemplateVariable) =>
    v.component === 'header'
      ? 'Header variable'
      : v.component === 'button'
        ? `Button ${String(v.index + 1)} variable`
        : `{{${v.key.replace(/^header_/, '')}}}`;
  const changed = template.variables.some(
    (v) =>
      sources[v.key]?.kind !== v.defaultSource.kind ||
      (sources[v.key]?.value ?? null) !== v.defaultSource.value,
  );
  return (
    <Section title="Variable values">
      <Typography variant="caption" color="text.secondary">
        Where each value comes from when someone sends this template (they can still change it).
      </Typography>
      {template.variables.map((v) => {
        const s = sources[v.key] ?? v.defaultSource;
        const set = (next: Partial<typeof s>) =>
          setSources((all) => ({ ...all, [v.key]: { ...s, ...next } }));
        return (
          <Stack key={v.key} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              select
              size="small"
              label={label(v)}
              value={s.kind}
              disabled={!canManage}
              onChange={(e) =>
                set({ kind: e.target.value as WhatsAppVariableSourceKind, value: null })
              }
              sx={{ minWidth: 180 }}
            >
              {SOURCE_KINDS.map((k) => (
                <MenuItem key={k} value={k}>
                  {VARIABLE_SOURCE_LABELS[k]}
                </MenuItem>
              ))}
            </TextField>
            {s.kind === 'field' && (
              <TextField
                select
                size="small"
                label="Custom field"
                value={s.value ?? ''}
                disabled={!canManage}
                onChange={(e) => set({ value: e.target.value })}
                sx={{ minWidth: 180 }}
              >
                {(fields.data ?? []).map((f) => (
                  <MenuItem key={f.key} value={f.key}>
                    {f.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {s.kind === 'static' && (
              <TextField
                size="small"
                label="Fixed text"
                value={s.value ?? ''}
                disabled={!canManage}
                onChange={(e) => set({ value: e.target.value })}
                slotProps={{ htmlInput: { maxLength: TEMPLATE_LIMITS.variableValueMax } }}
              />
            )}
          </Stack>
        );
      })}
      {canManage && (
        <Box>
          <Button
            size="small"
            variant="outlined"
            disabled={!changed || save.isPending}
            onClick={() =>
              save.mutate(
                {
                  id: template.id,
                  sources: template.variables.map((v) => ({
                    key: v.key,
                    kind: sources[v.key]?.kind ?? v.defaultSource.kind,
                    value: sources[v.key]?.value ?? null,
                  })),
                },
                {
                  onSuccess: () => enqueueSnackbar('Variable values saved', { variant: 'success' }),
                },
              )
            }
          >
            Save variable values
          </Button>
        </Box>
      )}
    </Section>
  );
}

function DeleteDialog({
  template,
  onClose,
  onDeleted,
}: {
  template: WhatsAppTemplate;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [scope, setScope] = useState<DeleteScope>('language');
  const remove = useDeleteTemplate();
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete template?</DialogTitle>
      <DialogContent>
        <RadioGroup
          value={scope}
          onChange={(e) => setScope(e.target.value as DeleteScope)}
          aria-label="What to delete"
        >
          <FormControlLabel
            value="language"
            control={<Radio />}
            label={`Only ${languageLabel(template.language)} (${template.language})`}
          />
          <FormControlLabel
            value="name"
            control={<Radio />}
            label={`Every language of ${template.name}`}
          />
        </RadioGroup>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          WhatsApp keeps the name {template.name} blocked for {TEMPLATE_LIMITS.deletedNameLockDays}{' '}
          days — a new template can&apos;t use it until then. Messages already sent stay in the
          chats.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          color="error"
          variant="contained"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(
              { id: template.id, scope },
              {
                onSuccess: ({ deleted }) => {
                  enqueueSnackbar(
                    deleted > 1 ? `${String(deleted)} templates deleted` : 'Template deleted',
                    {
                      variant: 'success',
                    },
                  );
                  onDeleted();
                },
              },
            )
          }
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Template details: preview, components, status history, usage, variable values, delete. */
export function TemplateDrawer({
  templateId,
  canManage,
  onClose,
  onEdit,
}: {
  templateId: string | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (template: WhatsAppTemplate) => void;
}) {
  const query = useTemplate(templateId);
  const submit = useSubmitTemplate();
  const [deleting, setDeleting] = useState(false);
  const t = query.data;
  const reason = t ? reasonText(t.statusReason) : null;
  const editable = Boolean(t && t.editable && EDITABLE.includes(t.status));
  const deletable = Boolean(t && !['DELETED', 'PENDING_DELETION'].includes(t.status));

  return (
    <Drawer anchor="right" open={Boolean(templateId)} onClose={onClose}>
      <Box
        sx={{ width: { xs: '100vw', sm: 480 }, p: 3 }}
        role="region"
        aria-label="Template details"
      >
        <Stack direction="row" sx={{ alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ flex: 1, wordBreak: 'break-all' }}>
            {t?.name ?? 'Template'}
          </Typography>
          <IconButton aria-label="Close details" onClick={onClose}>
            <Close />
          </IconButton>
        </Stack>
        {query.isError && (
          <Alert severity="error">{templateErrorMessage(toApiError(query.error))}</Alert>
        )}
        {!t && !query.isError && <Skeleton height={240} aria-label="Loading template" />}
        {t && (
          <Stack spacing={2.5}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ flexWrap: 'wrap', alignItems: 'center', rowGap: 1 }}
            >
              <TemplateStatusChip status={t.status} reason={reason} />
              <CategoryChip category={t.category} previous={t.previousCategory} />
              <Chip
                size="small"
                variant="outlined"
                label={`${languageLabel(t.language)} · ${t.language}`}
              />
              {t.purpose === 'call_permission' && <Chip size="small" label="Call permission" />}
              <QualityDot quality={t.quality} />
            </Stack>

            {reason && ['REJECTED', 'PAUSED', 'DISABLED', 'FLAGGED'].includes(t.status) && (
              <Alert
                severity={t.status === 'FLAGGED' || t.status === 'PAUSED' ? 'warning' : 'error'}
                action={
                  canManage && editable && t.status !== 'APPROVED' ? (
                    <Button color="inherit" size="small" onClick={() => onEdit(t)}>
                      Edit and resubmit
                    </Button>
                  ) : undefined
                }
              >
                {reason}
                {t.pausedUntil && (
                  <>
                    {' '}
                    Paused until <RelativeTime value={t.pausedUntil} />.
                  </>
                )}
              </Alert>
            )}
            {!t.editable && (
              <Alert severity="info">
                {t.category === 'AUTHENTICATION'
                  ? 'Authentication templates are managed in WhatsApp Manager.'
                  : 'This template uses parts this app can’t edit.'}{' '}
                <Link href={WHATSAPP_MANAGER_URL} target="_blank" rel="noopener noreferrer">
                  Edit in WhatsApp Manager{' '}
                  <OpenInNew sx={{ fontSize: 14, verticalAlign: 'middle' }} />
                </Link>
              </Alert>
            )}

            <TemplatePreview
              preview={buildPreview(t.components, t.parameterFormat, {
                values: sampleValues(t.variables),
                headerFileName: t.headerMedia?.fileName ?? null,
              })}
            />

            {canManage && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                {editable && (
                  <Button variant="outlined" onClick={() => onEdit(t)}>
                    Edit
                  </Button>
                )}
                {t.status === 'DRAFT' && (
                  <Button
                    variant="contained"
                    disabled={submit.isPending}
                    onClick={() =>
                      submit.mutate(t.id, {
                        onSuccess: () =>
                          enqueueSnackbar('Sent to WhatsApp for review', { variant: 'success' }),
                        onError: (e) =>
                          enqueueSnackbar(templateErrorMessage(toApiError(e)), {
                            variant: 'error',
                          }),
                      })
                    }
                  >
                    Submit for review
                  </Button>
                )}
                {deletable && (
                  <Button color="error" onClick={() => setDeleting(true)}>
                    Delete
                  </Button>
                )}
              </Stack>
            )}

            <Section title="Usage">
              <Typography variant="body2">
                {formatNumber(t.usage.sent)} sent · {formatNumber(t.usage.delivered)} delivered ·{' '}
                {formatNumber(t.usage.read)} read · {formatNumber(t.usage.failed)} failed
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Last used:{' '}
                {t.usage.lastSentAt ? <RelativeTime value={t.usage.lastSentAt} /> : 'never'}
              </Typography>
            </Section>

            <VariableDefaults key={t.updatedAt} template={t} canManage={canManage} />

            <Section title="Status history">
              <Stack component="ol" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
                {[...t.statusHistory].reverse().map((h, i) => (
                  <Typography component="li" variant="body2" key={`${h.at}-${String(i)}`}>
                    {h.status.replace(/_/g, ' ').toLowerCase()} {HISTORY_SOURCE[h.source]} ·{' '}
                    <RelativeTime value={h.at} />
                    {h.reason ? ` — ${h.reason}` : ''}
                  </Typography>
                ))}
              </Stack>
            </Section>
            <Divider />
            <Typography variant="caption" color="text.secondary">
              Last synced with WhatsApp:{' '}
              {t.syncedAt ? <RelativeTime value={t.syncedAt} /> : 'not yet'}
            </Typography>
          </Stack>
        )}
      </Box>
      {deleting && t && (
        <DeleteDialog
          template={t}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            onClose();
          }}
        />
      )}
    </Drawer>
  );
}
