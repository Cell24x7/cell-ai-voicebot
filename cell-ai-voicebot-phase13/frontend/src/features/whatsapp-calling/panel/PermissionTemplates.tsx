import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router';

import type { WhatsAppTemplateListItem } from '@/services/api/types';

import { usePermissionTemplates } from '../queries';

const CREATE_LINK = '/whatsapp/templates?create=call_permission';
const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  IN_APPEAL: 'warning',
  REJECTED: 'error',
  PAUSED: 'error',
  DISABLED: 'error',
};

const reasonOf = (t: WhatsAppTemplateListItem) =>
  t.statusReason ? (t.statusReason.description ?? t.statusReason.reason) : null;

/** Name · language, a status chip, and WhatsApp's rejection reason. */
export function PermissionTemplateLabel({ t }: { t: WhatsAppTemplateListItem }) {
  const reason = t.status === 'REJECTED' ? reasonOf(t) : null;
  return (
    <Stack spacing={0.25}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <span>
          {t.name} · {t.language}
        </span>
        <Chip size="small" label={t.status} color={STATUS_COLOR[t.status] ?? 'default'} />
      </Stack>
      {reason && (
        <Typography variant="caption" color="error">
          {reason}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * Phase 18B: what the number's call permission template needs — nothing when one is
 * approved; else create one, wait for review, or edit and resubmit a rejected one.
 */
export function PermissionTemplateNotice({ channelId }: { channelId: string }) {
  const { rows, approved, isSuccess } = usePermissionTemplates(channelId);
  if (!isSuccess || approved.length) return null;
  if (!rows.length) {
    return (
      <Alert severity="warning">
        No approved permission template — outside the 24-hour chat window customers can only be
        asked with one.{' '}
        <Link component={RouterLink} to={CREATE_LINK}>
          Create one
        </Link>
      </Alert>
    );
  }
  const rejected = rows.filter((t) => t.status === 'REJECTED');
  return (
    <Alert severity={rejected.length ? 'error' : 'info'}>
      <Stack spacing={0.5}>
        <span>
          {rejected.length
            ? 'WhatsApp rejected the call permission template.'
            : 'The call permission template is waiting for WhatsApp review.'}
        </span>
        {rows.map((t) => (
          <PermissionTemplateLabel key={t.id} t={t} />
        ))}
        {rejected.length > 0 && (
          <Link component={RouterLink} to="/whatsapp/templates">
            Edit and resubmit
          </Link>
        )}
      </Stack>
    </Alert>
  );
}

/** Pick a permission template; only approved ones can be chosen. */
export function PermissionTemplateSelect({
  channelId,
  value,
  onChange,
}: {
  channelId: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { rows, approved, isSuccess } = usePermissionTemplates(channelId);
  if (isSuccess && !approved.length) return <PermissionTemplateNotice channelId={channelId} />;
  const current = approved.find((t) => t.id === value) ?? approved[0];
  return (
    <TextField
      select
      size="small"
      label="Template"
      value={current?.id ?? ''}
      onChange={(e) => onChange(e.target.value)}
      helperText="Only approved templates can be sent."
    >
      {rows.map((t) => (
        <MenuItem key={t.id} value={t.id} disabled={t.status !== 'APPROVED'}>
          <PermissionTemplateLabel t={t} />
        </MenuItem>
      ))}
    </TextField>
  );
}
