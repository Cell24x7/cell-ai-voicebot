import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Step,
  StepButton,
  Stepper,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router';

import { useUnsavedChangesGuard } from '@/components/fields/useUnsavedChangesGuard';
import { PageHeader } from '@/components/PageHeader';
import { useSession } from '@/features/auth/hooks';
import { campaignKeys } from '@/features/campaigns/keys';
import { useCampaign, useCampaignEstimate, useCanRunCampaigns } from '@/features/campaigns/queries';
import { AudienceStep } from '@/features/campaigns/wizard/AudienceStep';
import { BasicsStep } from '@/features/campaigns/wizard/BasicsStep';
import {
  draftFromCampaign,
  emptyDraft,
  lockRule,
  serverErrorsByStep,
  stepProblems,
  STEPS,
  toCreateInput,
  toUpdateInput,
  type StepIndex,
  type WizardDraft,
} from '@/features/campaigns/wizard/draft';
import { RetriesStep } from '@/features/campaigns/wizard/RetriesStep';
import { ReviewStep } from '@/features/campaigns/wizard/ReviewStep';
import { ScheduleStep } from '@/features/campaigns/wizard/ScheduleStep';
import { campaignsApi } from '@/services/api/campaigns';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { Campaign, CampaignStatus } from '@/services/api/types';

interface Saved {
  id: string;
  revision: number;
  status: CampaignStatus;
}

const savedOf = (c: Campaign): Saved => ({ id: c.id, revision: c.revision, status: c.status });

/** `/campaigns/new` and `/campaigns/:id/edit` — the 5-step wizard (PHASE_8_PLAN §1s). */
export function CampaignWizardPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const account = useSession()?.account;
  const existing = useCampaign(id);
  if (!account) return null;
  if (id && existing.isPending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress aria-label="Loading campaign" />
      </Box>
    );
  }
  if (id && existing.error) {
    return <Alert severity="error">{getErrorMessage(existing.error)}</Alert>;
  }
  const initial = existing.data
    ? draftFromCampaign(existing.data)
    : prefill(
        emptyDraft({ timezone: account.timezone, window: account.settings.callingWindow }),
        params,
      );
  return (
    <WizardForm
      // the form keeps its own revision after saves — remount only for another campaign
      key={existing.data?.id ?? 'new'}
      initial={initial}
      saved={existing.data ? savedOf(existing.data) : null}
    />
  );
}

/** `?flowId=` (flow page), `?listId=` / `?segmentId=` (contacts) prefill a new draft. */
const prefill = (draft: WizardDraft, params: URLSearchParams): WizardDraft => {
  const next = { ...draft };
  const flowId = params.get('flowId');
  const listId = params.get('listId');
  const segmentId = params.get('segmentId');
  if (flowId) next.flowId = flowId;
  if (listId) Object.assign(next, { audienceMode: 'lists', listIds: [listId] });
  if (segmentId) Object.assign(next, { audienceMode: 'segment', segmentId });
  return next;
};

function WizardForm({
  initial,
  saved: savedAtLoad,
}: {
  initial: WizardDraft;
  saved: Saved | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canRun = useCanRunCampaigns();
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [step, setStep] = useState<StepIndex>(0);
  const [saved, setSaved] = useState<Saved | null>(savedAtLoad);
  const [problems, setProblems] = useState<string[]>([]);
  const [serverErrors, setServerErrors] = useState<Partial<Record<StepIndex, string[]>>>({});
  const [conflict, setConflict] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const startKey = useRef<string | null>(null);
  const lock = lockRule(saved?.status ?? null);
  const dirty = JSON.stringify(draft) !== baseline;
  useUnsavedChangesGuard(dirty && !leaving);
  const estimate = useCampaignEstimate(saved?.id ?? '', step === 4);

  const onChange = (patch: Partial<WizardDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setProblems([]);
  };

  const save = useMutation({
    mutationFn: () =>
      saved
        ? campaignsApi.update(saved.id, toUpdateInput(draft, saved.revision, saved.status))
        : campaignsApi.create(toCreateInput(draft)),
    meta: { silent: true },
    onSuccess: (c) => {
      setSaved(savedOf(c));
      setBaseline(JSON.stringify(draft));
      setServerErrors({});
      queryClient.setQueryData(campaignKeys.detail(c.id), c);
      void queryClient.invalidateQueries({ queryKey: campaignKeys.lists });
      void queryClient.invalidateQueries({ queryKey: campaignKeys.estimate(c.id) });
    },
    onError: (err) => {
      if (toApiError(err).code === 'CAMPAIGN_REVISION_CONFLICT') {
        setConflict(true);
        return;
      }
      const byStep = serverErrorsByStep(err);
      setServerErrors(byStep);
      const first = (Object.keys(byStep).map(Number) as StepIndex[]).sort()[0];
      if (first !== undefined) setStep(first);
    },
  });

  const start = useMutation({
    mutationFn: (campaignId: string) => {
      // one key per attempt: a retry of the same click (network) reuses it
      startKey.current ??= crypto.randomUUID();
      return campaignsApi.start(campaignId, startKey.current);
    },
    meta: { silent: true },
    onSuccess: (c) => {
      startKey.current = null;
      enqueueSnackbar(c.status === 'scheduled' ? 'Campaign scheduled' : 'Campaign started', {
        variant: 'success',
      });
      void queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      setLeaving(true);
      void navigate(`/campaigns/${c.id}`);
    },
  });

  const goTo = (target: StepIndex) => {
    if (target < step) {
      setStep(target);
      return;
    }
    const issues = stepProblems(step, draft);
    if (issues.length) {
      setProblems(issues);
      return;
    }
    if (target === 4) {
      // the review shows the server's estimate: save first
      save.mutate(undefined, { onSuccess: () => setStep(4) });
      return;
    }
    setStep(target);
  };
  const finish = (to: 'detail') => {
    if (!saved) return;
    setLeaving(true);
    void navigate(to === 'detail' ? `/campaigns/${saved.id}` : '/campaigns');
  };

  /** After a revision conflict: take the latest revision, and its settings when `reload`. */
  const reloadConflict = async (reload: boolean) => {
    if (!saved) return;
    const latest = await campaignsApi.get(saved.id);
    setSaved(savedOf(latest));
    if (reload) {
      const fresh = draftFromCampaign(latest);
      setDraft(fresh);
      setBaseline(JSON.stringify(fresh));
    }
    setConflict(false);
  };

  if (lock === 'all' && saved) {
    return (
      <>
        <PageHeader title="Edit campaign" />
        <Alert
          severity="info"
          action={
            <Button component={RouterLink} to={`/campaigns/${saved.id}`}>
              Open
            </Button>
          }
        >
          This campaign has finished — it can’t be edited. Duplicate it to run it again.
        </Alert>
      </>
    );
  }

  const later = Boolean(draft.schedule.startAt) || Boolean(draft.schedule.recurrence);
  const stepErrors = [...problems, ...(serverErrors[step] ?? [])];
  return (
    <>
      <PageHeader
        title={saved ? `Edit ${draft.name || 'campaign'}` : 'New campaign'}
        subtitle={
          lock === 'live'
            ? 'Running campaign — the name, end, window, retries and pacing can change'
            : 'Dry-run campaigns go through the real flow with simulated customers'
        }
      />
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stepper nonLinear activeStep={step} sx={{ mb: 3 }} alternativeLabel>
          {STEPS.map((label, i) => (
            <Step key={label} completed={i < step}>
              <StepButton onClick={() => goTo(i as StepIndex)}>{label}</StepButton>
            </Step>
          ))}
        </Stepper>
        {stepErrors.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {stepErrors.map((p) => (
              <div key={p}>{p}</div>
            ))}
          </Alert>
        )}
        {save.error && !conflict && Object.keys(serverErrors).length === 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {getErrorMessage(save.error)}
          </Alert>
        )}
        {start.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {getErrorMessage(start.error)}
          </Alert>
        )}
        {step === 0 && <BasicsStep draft={draft} onChange={onChange} lock={lock} />}
        {step === 1 && <AudienceStep draft={draft} onChange={onChange} lock={lock} />}
        {step === 2 && <ScheduleStep draft={draft} onChange={onChange} lock={lock} />}
        {step === 3 && <RetriesStep draft={draft} onChange={onChange} lock={lock} />}
        {step === 4 && <ReviewStep draft={draft} onEdit={setStep} estimate={estimate} />}
        <Stack direction="row" spacing={1} sx={{ mt: 3, justifyContent: 'flex-end' }}>
          {step > 0 && <Button onClick={() => setStep((step - 1) as StepIndex)}>Back</Button>}
          {step < 4 && (
            <Button
              variant="contained"
              onClick={() => goTo((step + 1) as StepIndex)}
              disabled={save.isPending}
            >
              {step === 3 && save.isPending ? 'Saving…' : 'Next'}
            </Button>
          )}
          {step === 4 && (
            <>
              <Button
                variant={lock === 'none' ? 'outlined' : 'contained'}
                disabled={save.isPending || !saved}
                onClick={() =>
                  dirty
                    ? save.mutate(undefined, { onSuccess: () => finish('detail') })
                    : finish('detail')
                }
              >
                {lock === 'none' ? 'Save draft' : 'Save changes'}
              </Button>
              {lock === 'none' && canRun && (
                <Button
                  variant="contained"
                  disabled={!saved || start.isPending || save.isPending}
                  onClick={() => saved && start.mutate(saved.id)}
                >
                  {start.isPending ? 'Starting…' : later ? 'Schedule' : 'Start now'}
                </Button>
              )}
            </>
          )}
        </Stack>
      </Paper>
      <Dialog open={conflict} onClose={() => setConflict(false)}>
        <DialogTitle>Someone else changed this campaign</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Reload to see their changes (yours are dropped), or keep editing and save over them.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void reloadConflict(false)}>Keep editing</Button>
          <Button variant="contained" onClick={() => void reloadConflict(true)}>
            Reload
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
