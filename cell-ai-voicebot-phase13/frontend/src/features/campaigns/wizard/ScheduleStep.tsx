import { Alert, Stack, Typography } from '@mui/material';

import { useSession } from '@/features/auth/hooks';

import { CallingWindowField } from '../fields/CallingWindowField';
import { ScheduleField } from '../fields/ScheduleField';
import { TRAI_BOUND } from '../time';

import type { StepProps } from './BasicsStep';
import { isLocked } from './draft';

/** When to start (now / later / repeat), the end, and the calling window. */
export function ScheduleStep({ draft, onChange, lock }: StepProps) {
  const account = useSession()?.account;
  const live = lock === 'live';
  return (
    <Stack spacing={3}>
      {live && (
        <Alert severity="info">
          The campaign already started — only its end and calling window can change here.
        </Alert>
      )}
      {live ? (
        // a started campaign can still move its end
        <ScheduleField
          value={draft.schedule}
          timezone={draft.timezone}
          onChange={(s) => onChange({ schedule: { ...draft.schedule, endAt: s.endAt ?? null } })}
          endOnly
        />
      ) : (
        <ScheduleField
          value={draft.schedule}
          timezone={draft.timezone}
          disabled={isLocked(lock, 'schedule')}
          onChange={(schedule) => onChange({ schedule })}
        />
      )}
      <CallingWindowField
        value={draft.window}
        onChange={(window) => onChange({ window })}
        disabled={isLocked(lock, 'window')}
        {...(account ? { accountWindow: account.settings.callingWindow } : {})}
        {...(draft.mode === 'live'
          ? { bound: { ...TRAI_BOUND, label: 'the TRAI hours (09:00–21:00)' } }
          : {})}
      />
      <Typography variant="body2" color="text.secondary">
        Times are in {draft.timezone}. Dry runs follow the account and campaign windows; live calls
        are also held to 09:00–21:00 (TRAI) and recovery calls to 08:00–19:00 (RBI).
      </Typography>
    </Stack>
  );
}
