import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import type { WebhookCheck, WebhookFixResult } from '@/services/api/types';

const STEP_LABELS: Record<WebhookFixResult['steps'][number]['key'], string> = {
  app_subscribed: 'Our app receives this WhatsApp account’s events',
  fields: 'The app webhook has messages and calls',
  fix_app: 'Subscribed our app to the WhatsApp account',
  fix_fields: 'Added the missing webhook fields',
};

/** SAC-T4: does Meta deliver this number's events (messages, calls) to us? */
export function WebhookChip({ check }: { check: WebhookCheck | undefined }) {
  if (!check || check.status === 'unknown') {
    return <Chip size="small" variant="outlined" label="Webhook ?" />;
  }
  if (check.status === 'ok') {
    return <Chip size="small" variant="outlined" color="success" label="Webhook ✓" />;
  }
  const missing = check.missingFields.length ? `Missing: ${check.missingFields.join(', ')}` : '';
  return (
    <Tooltip
      title={[check.appSubscribed === false ? 'Our app is not subscribed.' : '', missing]
        .filter(Boolean)
        .join(' ')}
    >
      <Chip size="small" color="error" label="Webhook ✗" />
    </Tooltip>
  );
}

/**
 * SAC-T4: **Webhook check / Fix** — subscribes our app to the WABA and adds missing app
 * webhook fields, checks again and shows each step.
 */
export function WebhookFixButton({
  run,
  invalidate,
  disabled = false,
}: {
  run: () => Promise<WebhookFixResult>;
  /** Query keys to refresh after a fix (the channel list / card). */
  invalidate: readonly (readonly unknown[])[];
  disabled?: boolean;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const fix = useMutation({
    mutationFn: run,
    meta: { silent: true },
    onSettled: () => {
      for (const key of invalidate) void client.invalidateQueries({ queryKey: key });
    },
  });
  const result = fix.data;
  return (
    <>
      <Button
        size="small"
        disabled={disabled || fix.isPending}
        onClick={() => {
          setOpen(true);
          fix.mutate();
        }}
      >
        Webhook check / Fix
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Webhook check</DialogTitle>
        <DialogContent>
          {fix.isPending && <Alert severity="info">Checking with Meta…</Alert>}
          {fix.error && <Alert severity="error">{getErrorMessage(fix.error)}</Alert>}
          {result && (
            <>
              <Alert
                severity={result.webhookCheck.status === 'ok' ? 'success' : 'error'}
                sx={{ mb: 1 }}
              >
                {result.webhookCheck.status === 'ok'
                  ? 'Meta delivers this number’s messages and calls to us.'
                  : 'Meta still does not deliver this number’s events. Check the Meta app’s webhook (URL and verify token) or contact support.'}
              </Alert>
              <List dense aria-label="Webhook steps">
                {result.steps.map((s) => (
                  <ListItem key={s.key}>
                    <ListItemText
                      primary={`${s.ok ? '✓' : '✗'} ${STEP_LABELS[s.key]}`}
                      secondary={s.detail}
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
