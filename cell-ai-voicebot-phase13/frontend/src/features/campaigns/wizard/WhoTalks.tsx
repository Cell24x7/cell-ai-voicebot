import {
  Alert,
  Autocomplete,
  Checkbox,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { teamApi } from '@/services/api/team';

import { isLocked, TEAM_WRAP_UP, type LockRule, type WizardDraft } from './draft';

/**
 * CM — who talks on the campaign's calls: the AI (flow / agent) or the team (members who
 * join the campaign's calling session in the browser). SIP / normal and WhatsApp calls.
 */
export function WhoTalks({
  draft,
  onChange,
  lock,
  liveAllowed,
}: {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
  lock: LockRule;
  /** The account can make live calls on this line. */
  liveAllowed: boolean;
}) {
  const team = draft.talkMode === 'team';
  const locked = isLocked(lock, 'mode');
  const members = useQuery({
    queryKey: ['team', 'callers'],
    queryFn: () => teamApi.list({ status: 'active', limit: 100 }),
    enabled: team,
    staleTime: 60_000,
    meta: { silent: true },
  });
  const people = (members.data?.data ?? []).filter((m) => m.role.key !== 'viewer');
  const chosen = draft.team.agentUserIds;
  const setTeam = (patch: Partial<WizardDraft['team']>) =>
    onChange({ team: { ...draft.team, ...patch } });
  return (
    <Stack spacing={2} component="section" aria-label="Who talks">
      <div>
        <Typography variant="subtitle2">Who talks?</Typography>
        <RadioGroup
          value={draft.talkMode}
          aria-label="Who talks?"
          onChange={(e) => {
            const next = e.target.value as WizardDraft['talkMode'];
            onChange({
              talkMode: next,
              ...(next === 'team'
                ? { mode: 'live' as const, program: null, flowId: '', chosenVersion: null }
                : {}),
            });
          }}
        >
          <FormControlLabel
            value="ai"
            control={<Radio />}
            disabled={locked}
            label="AI — a flow or AI agent talks with each customer"
          />
          <FormControlLabel
            value="team"
            control={<Radio />}
            disabled={locked || (!liveAllowed && !team)}
            label="My team — members take the calls in the browser, one at a time"
          />
        </RadioGroup>
        {!liveAllowed && !team && (
          <Typography variant="caption" color="text.secondary">
            Team calling needs live calls on this line.
          </Typography>
        )}
      </div>
      {team && (
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Checkbox
                checked={chosen === null}
                disabled={locked}
                onChange={(_e, everyone) => setTeam({ agentUserIds: everyone ? null : [] })}
              />
            }
            label="Everyone who may make calls can join"
          />
          {chosen !== null && (
            <Autocomplete
              multiple
              options={people}
              loading={members.isPending}
              disabled={locked}
              getOptionLabel={(m) => m.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              value={people.filter((m) => chosen.includes(m.id))}
              onChange={(_e, value) => setTeam({ agentUserIds: value.map((m) => m.id) })}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Team members who take the calls"
                  error={chosen.length === 0}
                  helperText={chosen.length === 0 ? 'Choose at least one team member' : ' '}
                />
              )}
            />
          )}
          <TextField
            label="Wrap-up time (seconds)"
            type="number"
            value={draft.team.wrapUpSec}
            onChange={(e) => setTeam({ wrapUpSec: Number(e.target.value) })}
            helperText="Time after each call to save the outcome before the next call (0–120)"
            sx={{ maxWidth: 280 }}
            slotProps={{ htmlInput: { min: TEAM_WRAP_UP.min, max: TEAM_WRAP_UP.max } }}
          />
          <Alert severity="info">
            Nobody is called until a team member opens this campaign and joins its calling session.
            Each member gets the next customer only when they are free — no AI minutes are charged.
          </Alert>
        </Stack>
      )}
    </Stack>
  );
}
