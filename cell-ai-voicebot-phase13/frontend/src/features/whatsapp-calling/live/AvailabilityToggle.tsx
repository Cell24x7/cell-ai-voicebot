import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useAuthStore } from '@/features/auth/store';
import { getErrorMessage } from '@/services/api/errors';
import type { CallAvailabilityStatus } from '@/services/api/types';

import { useCanAnswer, useSetCallAvailability } from '../queries';

import { isLive, useLiveCallStore } from './store';

const AVAILABILITY_LABELS: Record<CallAvailabilityStatus, string> = {
  available: 'Available',
  busy: 'Busy',
  offline: 'Offline',
};
const AVAILABILITY_HINT: Record<CallAvailabilityStatus, string> = {
  available: 'Customer calls ring you',
  busy: 'Calls do not ring you',
  offline: 'Calls do not ring you',
};
const COLOR: Record<CallAvailabilityStatus, string> = {
  available: 'success.main',
  busy: 'warning.main',
  offline: 'text.disabled',
};

/** Header: whether customer WhatsApp calls ring this user (`calls.answer` only). */
export function AvailabilityToggle() {
  const can = useCanAnswer();
  const status = useAuthStore((s) => s.session?.user.callAvailability ?? 'available');
  const onCall = useLiveCallStore((s) => isLive(s.active));
  const set = useSetCallAvailability();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!can) return null;
  // while on a call the server rings nobody else on this user: show it as busy
  const shown: CallAvailabilityStatus = onCall ? 'busy' : status;
  const choose = (next: CallAvailabilityStatus) => {
    setAnchor(null);
    if (next === status) return;
    set.mutate(next, {
      onSuccess: () =>
        useAuthStore.setState((s) =>
          s.session
            ? { session: { ...s.session, user: { ...s.session.user, callAvailability: next } } }
            : s,
        ),
      onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
    });
  };
  return (
    <>
      <Button
        size="small"
        color="inherit"
        aria-label={`Call availability: ${AVAILABILITY_LABELS[shown]}`}
        onClick={(e) => setAnchor(e.currentTarget)}
        disabled={set.isPending}
        startIcon={
          <Box
            aria-hidden
            sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: COLOR[shown] }}
          />
        }
        sx={{ textTransform: 'none', mx: 0.5, minWidth: 0 }}
      >
        {onCall ? 'On a call' : AVAILABILITY_LABELS[shown]}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {(Object.keys(AVAILABILITY_LABELS) as CallAvailabilityStatus[]).map((s) => (
          <MenuItem key={s} selected={s === status} onClick={() => choose(s)}>
            <ListItemText primary={AVAILABILITY_LABELS[s]} secondary={AVAILABILITY_HINT[s]} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
