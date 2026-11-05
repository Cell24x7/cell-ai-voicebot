import {
  Alert,
  Checkbox,
  FormControlLabel,
  FormHelperText,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { whatsappCapabilities } from '@/features/calls/capabilities';
import { CampaignTypeSelect } from '@/features/campaigns/CampaignTypeSelect';
import { useFlows, useFlowVersions } from '@/features/flows/queries';
import { useTemplates } from '@/features/templates/queries';
import { useChannels } from '@/features/whatsapp/queries';
import { ProgramPicker } from '@/features/whatsapp-calling/ProgramPicker';
import { phoneNumberKeys, phoneNumbersApi } from '@/services/api/phone-numbers';

import {
  emptyVoice,
  isLocked,
  LIMITS,
  type AmdMode,
  type LockRule,
  type WizardDraft,
} from './draft';
import { VoiceContentFields } from './VoiceFields';

const AMD_LABELS: Record<AmdMode, string> = {
  off: 'Off — every answer goes to the flow',
  hangup: 'Hang up on answering machines (not charged)',
  leave_message: 'Leave a message on answering machines',
};

export interface StepProps {
  draft: WizardDraft;
  onChange: (patch: Partial<WizardDraft>) => void;
  lock: LockRule;
}

export const LOCKED_HINT = "Can't change this once the campaign started";

/** Name, mode (live needs the account on the phone line), flow and version. */
export function BasicsStep({
  draft,
  onChange,
  lock,
  onBulkCampaign,
}: StepProps & { onBulkCampaign?: (() => void) | undefined }) {
  const flows = useFlows({ status: 'published', limit: 100 });
  const usable = (flows.data?.data ?? []).filter(
    (f) => f.publishedVersion && f.triggers.includes('campaign'),
  );
  const versions = useFlowVersions(draft.flowId);
  const selected = usable.find((f) => f.id === draft.flowId);
  const flowLocked = isLocked(lock, 'flow');
  const phone = useQuery({ queryKey: phoneNumberKeys.line, queryFn: () => phoneNumbersApi.line() });
  const channels = useChannels(draft.line === 'whatsapp');
  const ready = (channels.data?.items ?? []).filter((c) => whatsappCapabilities(c).calling);
  const permissionTemplates = useTemplates(
    { channelId: draft.channelId, purpose: 'call_permission', status: ['APPROVED'] },
    draft.line === 'whatsapp' && Boolean(draft.channelId),
  );
  const onSip =
    draft.line === 'whatsapp'
      ? ready.some((c) => c.id === draft.channelId)
      : phone.data?.line === 'sip';
  const voiceOn = phone.data?.voiceApi?.enabled === true;
  const voice = draft.line === 'voice_api';
  const line = draft.phoneLine;
  const setLine = (patch: Partial<WizardDraft['phoneLine']>) =>
    onChange({ phoneLine: { ...line, ...patch } });
  return (
    <Stack spacing={3}>
      <CampaignTypeSelect
        value={draft.line === 'whatsapp' ? 'whatsapp-call' : 'phone'}
        disabled={isLocked(lock, 'mode')}
        bulkDisabled={!onBulkCampaign}
        onChange={(type) => {
          if (type === 'whatsapp') {
            onBulkCampaign?.();
            return;
          }
          onChange({
            line: type === 'whatsapp-call' ? 'whatsapp' : 'phone',
            channelId: '',
            program: null,
            flowId: '',
            chosenVersion: null,
            askPermissionFirst: false,
            askPermissionTemplateId: '',
            voice: emptyVoice(),
          });
        }}
      />
      {draft.line !== 'whatsapp' && (voiceOn || voice) && (
        <div>
          <Typography variant="subtitle2">How the calls are made</Typography>
          <RadioGroup
            value={voice ? 'voice_api' : 'phone'}
            aria-label="How the calls are made"
            onChange={(e) =>
              onChange({
                line: e.target.value as WizardDraft['line'],
                flowId: '',
                chosenVersion: null,
                program: null,
                voice: emptyVoice(),
                ...(e.target.value === 'voice_api' ? { mode: 'live' as const } : {}),
              })
            }
          >
            <FormControlLabel
              value="phone"
              control={<Radio />}
              disabled={isLocked(lock, 'mode')}
              label="AI flow or agent — the bot talks with the customer"
            />
            <FormControlLabel
              value="voice_api"
              control={<Radio />}
              disabled={isLocked(lock, 'mode') || (!voiceOn && !voice)}
              label="Recorded voice or IVR — the same message to everyone"
            />
          </RadioGroup>
        </div>
      )}
      {voice && <VoiceContentFields draft={draft} onChange={onChange} lock={lock} />}
      {draft.line === 'whatsapp' && (
        <Stack spacing={2}>
          <TextField
            select
            label="WhatsApp calling number"
            value={draft.channelId}
            disabled={isLocked(lock, 'mode')}
            onChange={(e) => onChange({ channelId: e.target.value, askPermissionTemplateId: '' })}
          >
            {ready.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.label} · {c.displayPhoneNumber ?? c.phoneE164}
              </MenuItem>
            ))}
          </TextField>
          {!ready.length && (
            <Alert severity="info">
              Connect a WhatsApp number and enable calling first. Business App numbers support
              messaging only.
            </Alert>
          )}
          <ProgramPicker
            campaign
            value={draft.program}
            disabled={flowLocked}
            onChange={(program) =>
              onChange({
                program,
                flowId: program?.kind === 'flow' ? program.id : '',
                chosenVersion: null,
              })
            }
          />
          <Alert severity="info">
            Only customers who allowed WhatsApp calls from this number are called.
          </Alert>
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.askPermissionFirst}
                onChange={(_e, checked) => onChange({ askPermissionFirst: checked })}
              />
            }
            label="Ask for permission first"
          />
          {draft.askPermissionFirst && (
            <TextField
              select
              label="Call permission template"
              value={draft.askPermissionTemplateId}
              onChange={(e) => onChange({ askPermissionTemplateId: e.target.value })}
            >
              {(permissionTemplates.data ?? []).map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      )}
      <TextField
        label="Campaign name"
        value={draft.name}
        required
        disabled={isLocked(lock, 'name')}
        onChange={(e) => onChange({ name: e.target.value })}
        slotProps={{ htmlInput: { maxLength: LIMITS.nameMax } }}
      />
      {!voice && (
        <div>
          <Typography variant="subtitle2">Mode</Typography>
          <RadioGroup
            row
            value={draft.mode}
            onChange={(e) => onChange({ mode: e.target.value as WizardDraft['mode'] })}
            aria-label="Mode"
          >
            <FormControlLabel
              value="dry_run"
              control={<Radio />}
              label="Dry run (simulated calls)"
              disabled={isLocked(lock, 'mode')}
            />
            <Tooltip
              title={onSip ? '' : 'This account is on the test line — ask support to switch it'}
            >
              <span>
                <FormControlLabel
                  value="live"
                  control={<Radio />}
                  label="Live calls"
                  disabled={!onSip || isLocked(lock, 'mode')}
                />
              </span>
            </Tooltip>
          </RadioGroup>
          <FormHelperText>
            A dry run goes through the real flow with simulated customers and virtual time — no
            phone is called and nothing is charged.
          </FormHelperText>
        </div>
      )}
      {draft.mode === 'live' && draft.line === 'phone' && (
        <Stack spacing={2} component="section" aria-label="Phone line">
          <TextField
            select
            label="Caller number"
            value={line.callerNumberId ?? ''}
            disabled={isLocked(lock, 'mode')}
            onChange={(e) => setLine({ callerNumberId: e.target.value || null })}
            helperText="The number customers see"
            sx={{ maxWidth: 360 }}
          >
            <MenuItem value="">The account's first number</MenuItem>
            {(phone.data?.numbers ?? []).map((n) => (
              <MenuItem key={n.id} value={n.id}>
                {n.number}
                {n.label ? ` · ${n.label}` : ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Answering machines"
            value={line.amd}
            disabled={isLocked(lock, 'mode')}
            onChange={(e) => setLine({ amd: e.target.value as AmdMode })}
            helperText="Checking takes 2–5 seconds after the answer, before the bot speaks"
            sx={{ maxWidth: 420 }}
          >
            {Object.entries(AMD_LABELS).map(([value, text]) => (
              <MenuItem key={value} value={value}>
                {text}
              </MenuItem>
            ))}
          </TextField>
          {line.amd === 'leave_message' && (
            <TextField
              label="Message for answering machines"
              value={line.voicemailText}
              disabled={isLocked(lock, 'mode')}
              onChange={(e) => setLine({ voicemailText: e.target.value })}
              multiline
              minRows={2}
              required
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          )}
        </Stack>
      )}
      {draft.line === 'phone' && (
        <Tooltip title={flowLocked ? LOCKED_HINT : ''}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label="Flow"
              value={usable.some((f) => f.id === draft.flowId) ? draft.flowId : ''}
              disabled={flowLocked || flows.isPending}
              onChange={(e) => onChange({ flowId: e.target.value, chosenVersion: null })}
              sx={{ minWidth: 280 }}
              helperText={
                flows.isSuccess && !usable.length
                  ? 'Publish a flow whose start step allows campaigns first.'
                  : 'Published flows that can start from a campaign'
              }
            >
              {usable.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Version"
              value={draft.chosenVersion ?? 'latest'}
              disabled={flowLocked || !selected}
              onChange={(e) =>
                onChange({
                  chosenVersion: e.target.value === 'latest' ? null : Number(e.target.value),
                })
              }
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="latest">
                Latest{selected?.publishedVersion ? ` (v${String(selected.publishedVersion)})` : ''}
              </MenuItem>
              {(versions.data ?? []).map((v) => (
                <MenuItem key={v.version} value={v.version}>
                  v{v.version}
                  {v.notes ? ` — ${v.notes}` : ''}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Tooltip>
      )}
      {selected && !voice && (
        <Alert severity="info">
          {selected.name}: {selected.nodesCount} steps
          {selected.agents.length
            ? `, AI agent ${selected.agents.map((a) => a.name).join(', ')}`
            : ''}
          . The version is pinned when the campaign starts.
        </Alert>
      )}
    </Stack>
  );
}
