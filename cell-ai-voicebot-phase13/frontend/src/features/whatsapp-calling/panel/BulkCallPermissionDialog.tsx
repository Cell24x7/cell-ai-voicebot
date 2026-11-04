import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';

import { usePricePreview, useTemplate } from '@/features/templates/queries';
import { useChannels } from '@/features/whatsapp/queries';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { CallPermissionSkipReason } from '@/services/api/types';
import {
  whatsappCallingApi,
  type BulkCallPermissionInput,
  type BulkPermissionTarget,
} from '@/services/api/whatsapp-calling';
import { formatCurrencyMicros, formatNumber } from '@/utils/format';

import { CALL_ERROR_TEXT } from '../labels';
import { usePermissionRun, usePermissionTemplates } from '../queries';

import { BULK_PERMISSION_MAX, SKIP_REASON_LABELS } from './bulk';
import { PermissionTemplateSelect } from './PermissionTemplates';

const errorText = (err: unknown) => {
  const e = toApiError(err);
  return (
    (e.kind === 'http' && e.code ? CALL_ERROR_TEXT[e.code] : undefined) ?? getErrorMessage(err)
  );
};

/**
 * Ask many contacts to allow WhatsApp calls (Phase 18B): a number, an approved call
 * permission template (always the template — the 24-hour window is never assumed),
 * the estimate, then the run's progress and the result by reason.
 */
export function BulkCallPermissionDialog({
  target,
  count,
  onClose,
}: {
  target: BulkPermissionTarget;
  /** How many contacts (null = worked out when the run starts). */
  count: number | null;
  onClose: () => void;
}) {
  const channels = useChannels();
  const numbers = (channels.data?.items ?? []).filter(
    (c) => c.status === 'connected' && c.calling.status === 'enabled',
  );
  const [picked, setPicked] = useState('');
  const channelId = (numbers.find((c) => c.id === picked) ?? numbers[0])?.id ?? '';
  const { approved } = usePermissionTemplates(channelId);
  const [templateId, setTemplateId] = useState('');
  const chosen = approved.find((t) => t.id === templateId) ?? approved[0] ?? null;
  const detail = useTemplate(chosen?.id ?? null);
  const asks = (detail.data?.variables ?? []).filter((v) => v.defaultSource.kind === 'ask');
  const [values, setValues] = useState<Record<string, string>>({});
  const missing = asks.filter((v) => !values[v.key]?.trim());
  const firstContact = 'contactIds' in target ? target.contactIds[0] : undefined;
  const price = usePricePreview(
    channelId && chosen
      ? {
          channelId,
          templateId: chosen.id,
          ...(firstContact ? { contactId: firstContact } : { phone: '+919000000000' }),
        }
      : null,
  );
  const [key] = useState(() => crypto.randomUUID());
  const start = useMutation({
    mutationFn: (body: BulkCallPermissionInput) =>
      whatsappCallingApi.requestPermissionBulk(body, key),
    meta: { silent: true },
  });
  const runId = start.data?.runId ?? null;
  const run = usePermissionRun(runId);
  const tooMany = count !== null && count > BULK_PERMISSION_MAX;
  const finished = run.data?.status === 'done' || run.data?.status === 'stopped';

  const send = () => {
    if (!chosen) return;
    const variables = Object.fromEntries(asks.map((v) => [v.key, values[v.key]?.trim() ?? '']));
    start.mutate({
      channelId,
      target,
      templateId: chosen.id,
      ...(asks.length ? { variables } : {}),
    });
  };

  const results = () => {
    const r = run.data;
    if (!r) return <LinearProgress aria-label="Starting" />;
    const handled = r.sent + r.failed + Object.values(r.skipped).reduce((a, b) => a + (b ?? 0), 0);
    return (
      <Stack spacing={1.5}>
        <Typography variant="body2">
          {finished
            ? r.status === 'stopped'
              ? 'Stopped: the wallet ran out.'
              : 'Done.'
            : `Sending… ${formatNumber(handled)} of ${formatNumber(r.total)}`}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={r.total ? Math.min(100, (handled / r.total) * 100) : 100}
          aria-label="Progress"
        />
        <Table size="small" aria-label="Result">
          <TableBody>
            <TableRow>
              <TableCell>Sent</TableCell>
              <TableCell align="right">{formatNumber(r.sent)}</TableCell>
            </TableRow>
            {(Object.keys(SKIP_REASON_LABELS) as CallPermissionSkipReason[])
              .filter((reason) => (r.skipped[reason] ?? 0) > 0)
              .map((reason) => (
                <TableRow key={reason}>
                  <TableCell>Skipped: {SKIP_REASON_LABELS[reason]}</TableCell>
                  <TableCell align="right">{formatNumber(r.skipped[reason] ?? 0)}</TableCell>
                </TableRow>
              ))}
            <TableRow>
              <TableCell>Failed</TableCell>
              <TableCell align="right">{formatNumber(r.failed)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Stack>
    );
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="bulk-perm-title">
      <DialogTitle id="bulk-perm-title">Ask for WhatsApp call permission</DialogTitle>
      <DialogContent>
        {runId ? (
          results()
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {count === null ? 'Every contact in it' : `${formatNumber(count)} contacts`}
            </Typography>
            {tooMany && (
              <Alert severity="error">
                One request goes to at most {formatNumber(BULK_PERMISSION_MAX)} contacts. Pick
                fewer, or use a list or segment (the first {formatNumber(BULK_PERMISSION_MAX)} are
                asked).
              </Alert>
            )}
            {channels.isSuccess && !numbers.length ? (
              <Alert severity="info">
                No number has WhatsApp calling on. Turn it on in{' '}
                <Link component={RouterLink} to="/whatsapp/numbers">
                  WhatsApp → Numbers
                </Link>
                .
              </Alert>
            ) : (
              <>
                {numbers.length > 1 && (
                  <TextField
                    select
                    size="small"
                    label="From number"
                    value={channelId}
                    onChange={(e) => {
                      setPicked(e.target.value);
                      setTemplateId('');
                    }}
                  >
                    {numbers.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                <PermissionTemplateSelect
                  channelId={channelId}
                  value={chosen?.id ?? ''}
                  onChange={(id) => {
                    setTemplateId(id);
                    setValues({});
                  }}
                />
                {asks.map((v) => (
                  <TextField
                    key={v.key}
                    size="small"
                    required
                    label={`Value for {{${v.key}}}`}
                    placeholder={v.example}
                    value={values[v.key] ?? ''}
                    onChange={(e) => setValues((s) => ({ ...s, [v.key]: e.target.value }))}
                  />
                ))}
                {price.data && (
                  <Typography variant="body2">
                    {count === null
                      ? `About ${formatCurrencyMicros(price.data.priceMicros)} for each request sent.`
                      : `Up to ${formatCurrencyMicros(price.data.priceMicros * count)} (${formatCurrencyMicros(price.data.priceMicros)} × ${formatNumber(count)}). Skipped contacts are not charged.`}
                  </Typography>
                )}
              </>
            )}
            <Typography variant="body2" color="text.secondary">
              The customer sees Allow / Don&apos;t allow in WhatsApp. WhatsApp allows one request a
              day and two a week per customer. Contacts on DND, opted out, already allowed or who
              declined in the last 7 days are skipped. An empty wallet stops the run.
            </Typography>
            {start.isError && <Alert severity="error">{errorText(start.error)}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{runId ? 'Close' : 'Cancel'}</Button>
        {!runId && (
          <Button
            variant="contained"
            disabled={!chosen || tooMany || missing.length > 0 || start.isPending}
            onClick={send}
          >
            Send requests
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
