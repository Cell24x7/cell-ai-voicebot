import {
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';

import type { RetryOn } from '@/services/api/campaigns';

import { OutcomeMixField, ScenarioWeightsField } from '../fields/WeightFields';
import { PRIORITY_LABELS, RETRY_ON_LABELS } from '../labels';

import type { StepProps } from './BasicsStep';
import { DRY_RUN_SPEEDS, isLocked, LIMITS } from './draft';

const num = (v: string) => (v === '' ? 0 : Math.trunc(Number(v)));

/** Retries, callbacks / promise follow-ups, pacing and the dry-run simulation. */
export function RetriesStep({ draft, onChange, lock }: StepProps) {
  const { retry, followUps, pacing, dryRun } = draft;
  const retryLocked = isLocked(lock, 'retry');
  const followLocked = isLocked(lock, 'followUps');
  const pacingLocked = isLocked(lock, 'pacing');
  const dryLocked = isLocked(lock, 'dryRun');
  const toggleRetryOn = (k: RetryOn) =>
    onChange({
      retry: {
        ...retry,
        retryOn: retry.retryOn.includes(k)
          ? retry.retryOn.filter((x) => x !== k)
          : [...retry.retryOn, k],
      },
    });
  return (
    <Stack spacing={3}>
      <Typography variant="subtitle2">Retries</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Attempts per contact"
          type="number"
          value={retry.maxAttempts}
          disabled={retryLocked}
          onChange={(e) => onChange({ retry: { ...retry, maxAttempts: num(e.target.value) } })}
          slotProps={{ htmlInput: { min: LIMITS.attempts.min, max: LIMITS.attempts.max } }}
          helperText="1 to 5"
        />
        <TextField
          label="Retry after (minutes)"
          type="number"
          value={retry.intervalMinutes}
          disabled={retryLocked}
          onChange={(e) => onChange({ retry: { ...retry, intervalMinutes: num(e.target.value) } })}
          slotProps={{ htmlInput: { min: LIMITS.interval.min, max: LIMITS.interval.max } }}
          helperText="15 to 1440, moved into the calling window"
        />
      </Stack>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ flexWrap: 'wrap' }}
        aria-label="Retry when"
      >
        {(Object.keys(RETRY_ON_LABELS) as RetryOn[]).map((k) => (
          <Chip
            key={k}
            label={RETRY_ON_LABELS[k]}
            color={retry.retryOn.includes(k) ? 'primary' : 'default'}
            variant={retry.retryOn.includes(k) ? 'filled' : 'outlined'}
            onClick={retryLocked ? undefined : () => toggleRetryOn(k)}
            disabled={retryLocked}
          />
        ))}
      </Stack>

      <Divider />
      <Typography variant="subtitle2">Follow-ups</Typography>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'center' } }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={followUps.callbacks}
              disabled={followLocked}
              onChange={(e) =>
                onChange({ followUps: { ...followUps, callbacks: e.target.checked } })
              }
            />
          }
          label="Call back when the customer asks"
        />
        {followUps.callbacks && (
          <TextField
            label="Callbacks within (days)"
            type="number"
            size="small"
            value={followUps.callbackMaxDays}
            disabled={followLocked}
            onChange={(e) =>
              onChange({ followUps: { ...followUps, callbackMaxDays: num(e.target.value) } })
            }
          />
        )}
      </Stack>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'center' } }}
      >
        <FormControlLabel
          control={
            <Switch
              checked={followUps.promiseCheck.enabled}
              disabled={followLocked}
              onChange={(e) =>
                onChange({
                  followUps: {
                    ...followUps,
                    promiseCheck: { ...followUps.promiseCheck, enabled: e.target.checked },
                  },
                })
              }
            />
          }
          label="Call again after a promise to pay"
        />
        {followUps.promiseCheck.enabled && (
          <TextField
            label="Days after the promised date"
            type="number"
            size="small"
            value={followUps.promiseCheck.daysAfter}
            disabled={followLocked}
            onChange={(e) =>
              onChange({
                followUps: {
                  ...followUps,
                  promiseCheck: { ...followUps.promiseCheck, daysAfter: num(e.target.value) },
                },
              })
            }
          />
        )}
      </Stack>

      <Divider />
      <Typography variant="subtitle2">Pacing</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="Calls at once"
          type="number"
          value={pacing.concurrency}
          disabled={pacingLocked}
          onChange={(e) => onChange({ pacing: { ...pacing, concurrency: num(e.target.value) } })}
          helperText="At most the account limit"
        />
        <TextField
          label="Dials per minute"
          type="number"
          value={pacing.dialsPerMinute}
          disabled={pacingLocked}
          onChange={(e) => onChange({ pacing: { ...pacing, dialsPerMinute: num(e.target.value) } })}
          helperText="1 to 120"
        />
        <TextField
          select
          label="Priority"
          value={pacing.priority}
          disabled={pacingLocked}
          onChange={(e) =>
            onChange({ pacing: { ...pacing, priority: e.target.value as typeof pacing.priority } })
          }
          sx={{ minWidth: 140 }}
        >
          {(Object.keys(PRIORITY_LABELS) as (keyof typeof PRIORITY_LABELS)[]).map((k) => (
            <MenuItem key={k} value={k}>
              {PRIORITY_LABELS[k]}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <FormControlLabel
        control={
          <Switch
            checked={draft.autoResume}
            disabled={isLocked(lock, 'autoResume')}
            onChange={(e) => onChange({ autoResume: e.target.checked })}
          />
        }
        label="Resume by itself after the wallet is topped up"
      />

      {draft.mode === 'dry_run' && (
        <>
          <Divider />
          <Typography variant="subtitle2">Dry-run simulation</Typography>
          <OutcomeMixField
            value={dryRun.mix}
            disabled={dryLocked}
            onChange={(mix) => onChange({ dryRun: { ...dryRun, mix } })}
          />
          <ScenarioWeightsField
            value={dryRun.scenarios}
            disabled={dryLocked}
            onChange={(scenarios) => onChange({ dryRun: { ...dryRun, scenarios } })}
          />
          <TextField
            select
            label="Speed"
            value={dryRun.speed}
            disabled={dryLocked}
            onChange={(e) => onChange({ dryRun: { ...dryRun, speed: Number(e.target.value) } })}
            helperText="Virtual time: ×20 = one hour of calling in three minutes"
            sx={{ maxWidth: 220 }}
          >
            {DRY_RUN_SPEEDS.map((s) => (
              <MenuItem key={s} value={s}>
                ×{s}
              </MenuItem>
            ))}
          </TextField>
        </>
      )}
    </Stack>
  );
}
