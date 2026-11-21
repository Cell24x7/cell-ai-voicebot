import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';

import type { WhatsAppCallProgram, WhatsAppInboundRoute } from '@/services/api/types';

import { ProgramPicker } from '../ProgramPicker';

import { incomingStatusText } from './incoming-status';

export interface IncomingAnswerValue {
  route: WhatsAppInboundRoute;
  aiProgram: WhatsAppCallProgram | null;
}

/**
 * SAC-T7: "AI se incoming calls uthao". ON → the AI (a flow or an agent) answers, with "AI
 * first, then the team" or "AI only"; OFF → the team answers. Advanced: "Team first, then AI".
 * Maps onto the existing routes (`ai_then_team` / `ai` / `team` / `team_then_ai`).
 */
export function IncomingAnswerFields({
  value,
  onChange,
  disabled = false,
  programError = null,
}: {
  value: IncomingAnswerValue;
  onChange: (next: IncomingAnswerValue) => void;
  disabled?: boolean;
  programError?: string | null;
}) {
  const aiOn = value.route !== 'team';
  const advanced = value.route === 'team_then_ai';
  return (
    <Stack spacing={1.5}>
      <FormControlLabel
        control={
          <Switch
            checked={aiOn}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...value, route: e.target.checked ? 'ai_then_team' : 'team' })
            }
          />
        }
        label="AI se incoming calls uthao"
      />
      <Typography variant="body2" color="text.secondary">
        ON hone par chuna hua AI incoming WhatsApp calls uthayega. AI ki baat-cheet wallet se charge
        hogi.
      </Typography>
      {aiOn && (
        <>
          <ProgramPicker
            value={value.aiProgram}
            disabled={disabled}
            error={programError}
            onChange={(aiProgram) => onChange({ ...value, aiProgram })}
          />
          {!advanced && (
            <RadioGroup
              aria-label="How the AI answers"
              value={value.route}
              onChange={(e) =>
                onChange({ ...value, route: e.target.value as WhatsAppInboundRoute })
              }
            >
              <FormControlLabel
                value="ai_then_team"
                disabled={disabled}
                control={<Radio size="small" />}
                label="AI pehle, phir team (AI na mile to)"
              />
              <FormControlLabel
                value="ai"
                disabled={disabled}
                control={<Radio size="small" />}
                label="Sirf AI"
              />
            </RadioGroup>
          )}
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={advanced}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ ...value, route: e.target.checked ? 'team_then_ai' : 'ai_then_team' })
                }
              />
            }
            label="Advanced: team pehle, koi na uthaye to AI"
          />
        </>
      )}
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {incomingStatusText(value.route)}
      </Typography>
    </Stack>
  );
}
