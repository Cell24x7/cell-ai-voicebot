import {
  Alert,
  Button,
  LinearProgress,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
} from '@mui/material';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  Link as RouterLink,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';

import { useUnsavedChangesGuard } from '@/components/fields/useUnsavedChangesGuard';
import { PageHeader } from '@/components/PageHeader';
import { CampaignTypeSelect } from '@/features/campaigns/CampaignTypeSelect';
import { campaignCreatePath } from '@/features/campaigns/create-path';
import { templateKeys } from '@/features/templates/keys';
import { useTemplates } from '@/features/templates/queries';
import { useChannels } from '@/features/whatsapp/queries';
import {
  draftFromCampaign,
  emptyDraft,
  prefill,
  stepProblems,
  STEPS,
  toCreateInput,
  type StepIndex,
  type WaWizardDraft,
} from '@/features/whatsapp-campaigns/draft';
import { waCampaignKeys } from '@/features/whatsapp-campaigns/keys';
import { useCanWriteWaCampaigns } from '@/features/whatsapp-campaigns/permissions';
import {
  useWaCampaign,
  useWaCampaignEstimate,
  useStartWaCampaign,
} from '@/features/whatsapp-campaigns/queries';
import {
  AudienceStep,
  NumberStep,
  ReviewStep,
  ScheduleStep,
  TemplateStep,
  VariablesStep,
} from '@/features/whatsapp-campaigns/steps';
import { getErrorMessage } from '@/services/api/errors';
import { templatesApi } from '@/services/api/templates';
import { waCampaignsApi } from '@/services/api/whatsapp-campaigns';

export function WhatsAppCampaignWizardPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const campaign = useWaCampaign(id);
  const canWrite = useCanWriteWaCampaigns();
  if (!canWrite)
    return <Alert severity="info">You can view WhatsApp campaigns, but cannot change them.</Alert>;
  if (id && campaign.isPending) return <LinearProgress aria-label="Loading campaign" />;
  if (id && campaign.error)
    return <Alert severity="error">{getErrorMessage(campaign.error)}</Alert>;
  if (campaign.data && campaign.data.status !== 'draft')
    return (
      <Alert severity="info">
        This campaign has already been started.{' '}
        <RouterLink to={`/campaigns/whatsapp/${id}`}>View campaign</RouterLink>
      </Alert>
    );
  const initial = campaign.data ? draftFromCampaign(campaign.data) : prefill(emptyDraft(), params);
  const carriedName = (location.state as { campaignName?: unknown } | null)?.campaignName;
  if (!id && typeof carriedName === 'string') initial.name = carriedName;
  return <WizardForm key={id || 'new'} initial={initial} initialId={id} />;
}

function WizardForm({ initial, initialId }: { initial: WaWizardDraft; initialId: string }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const canWrite = useCanWriteWaCampaigns();
  const [draft, setDraft] = useState(initial);
  const [id, setId] = useState(initialId);
  const [step, setStep] = useState<StepIndex>(0);
  const [problems, setProblems] = useState<string[]>([]);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [leaving, setLeaving] = useState(false);
  const startKey = useRef<string | null>(null);
  const channels = useChannels();
  const approvedTemplates = useTemplates(
    { channelId: draft.channelId || undefined },
    Boolean(draft.channelId),
  );
  const templates = useQueries({
    queries: draft.variants.map((v) => ({
      queryKey: templateKeys.detail(v.templateId),
      queryFn: () => templatesApi.get(v.templateId),
      enabled: Boolean(v.templateId) && step >= 2,
    })),
  });
  useUnsavedChangesGuard(!leaving && JSON.stringify(draft) !== baseline);
  const estimate = useWaCampaignEstimate(id, step === 5);
  const start = useStartWaCampaign();
  const save = useMutation({
    mutationFn: () =>
      id
        ? waCampaignsApi.update(id, toCreateInput(draft))
        : waCampaignsApi.create(toCreateInput(draft)),
    meta: { silent: true },
    onSuccess: (c) => {
      setId(c.id);
      setBaseline(JSON.stringify(draft));
      client.setQueryData(waCampaignKeys.detail(c.id), c);
      client.removeQueries({ queryKey: waCampaignKeys.estimate(c.id) });
      void client.invalidateQueries({ queryKey: waCampaignKeys.lists });
      setStep(5);
    },
  });
  const onChange = (patch: Partial<WaWizardDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setProblems([]);
    save.reset();
    start.reset();
    startKey.current = null;
  };
  const next = () => {
    const issues = stepProblems(step, draft);
    if (step === 0 && draft.channelId) {
      if (channels.isPending || channels.error)
        issues.push('Load the WhatsApp numbers before continuing');
      else if (
        !channels.data?.items.some((c) => c.id === draft.channelId && c.status === 'connected')
      )
        issues.push('Choose a connected WhatsApp number');
    }
    if (step === 1 && draft.variants.every((v) => v.templateId)) {
      if (approvedTemplates.isPending || approvedTemplates.error)
        issues.push('Load the approved templates before continuing');
      else if (
        draft.variants.some(
          (v) =>
            !approvedTemplates.data?.some((t) => t.id === v.templateId && t.status === 'APPROVED'),
        )
      )
        issues.push('Choose approved templates for the selected WhatsApp number');
    }
    if (step === 2) {
      if (templates.some((t) => t.isPending || t.error))
        issues.push('Wait for the templates to load, or go back and select a template again');
      const needed = new Set(templates.flatMap((t) => t.data?.variables.map((v) => v.key) ?? []));
      if ([...needed].some((key) => !draft.variables[key]))
        issues.push('Choose a source for every template variable');
    }
    if (issues.length) {
      setProblems(issues);
      return;
    }
    if (step === 4) save.mutate();
    else setStep((step + 1) as StepIndex);
  };
  const onStart = () => {
    startKey.current ??= crypto.randomUUID();
    start.mutate(
      { id, key: startKey.current },
      {
        onSuccess: (c) => {
          setLeaving(true);
          void navigate(`/campaigns/whatsapp/${c.id}`);
        },
      },
    );
  };
  const props = { draft, onChange };
  const busy = save.isPending || start.isPending;
  return (
    <>
      <PageHeader
        title={initialId ? 'Edit WhatsApp bulk campaign' : 'New WhatsApp bulk campaign'}
        subtitle="Send an approved template to a contact audience"
        actions={
          <Button component={RouterLink} to="/campaigns?line=whatsapp">
            All campaigns
          </Button>
        }
      />
      <Stack spacing={3}>
        <Stepper activeStep={step} alternativeLabel>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            {problems.map((p) => (
              <Alert key={p} severity="error">
                {p}
              </Alert>
            ))}
            {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
            {step === 0 && (
              <>
                <CampaignTypeSelect
                  value="whatsapp"
                  disabled={Boolean(id)}
                  onChange={(type) => {
                    if (type === 'whatsapp') return;
                    void navigate(
                      campaignCreatePath(type, {
                        ...(draft.audienceMode === 'lists' ? { listIds: draft.listIds } : {}),
                        ...(draft.audienceMode === 'segment' ? { segmentId: draft.segmentId } : {}),
                        ...(draft.audienceMode === 'pick' ? { contactIds: draft.contactIds } : {}),
                      }),
                      { state: { campaignName: draft.name } },
                    );
                  }}
                />
                <NumberStep {...props} />
              </>
            )}
            {step === 1 && <TemplateStep {...props} />}
            {step === 2 && <VariablesStep {...props} />}
            {step === 3 && <AudienceStep {...props} />}
            {step === 4 && <ScheduleStep {...props} />}
            {step === 5 && (
              <ReviewStep
                {...props}
                sender={channels.data?.items.find((c) => c.id === draft.channelId)}
                templateNames={templates.flatMap((t) =>
                  t.data ? [`${t.data.name} (${t.data.language})`] : [],
                )}
                estimate={estimate}
                onStart={onStart}
                starting={start.isPending}
                startError={start.error}
                canRun={canWrite}
              />
            )}
          </Stack>
        </Paper>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Button
            disabled={step === 0 || busy}
            onClick={() => {
              setStep((step - 1) as StepIndex);
              setProblems([]);
            }}
          >
            Back
          </Button>
          {step < 5 && (
            <Button variant="contained" disabled={busy} onClick={next}>
              {save.isPending ? 'Saving…' : 'Next'}
            </Button>
          )}
          {step === 5 && (
            <Button component={RouterLink} disabled={busy} to={`/campaigns/whatsapp/${id}`}>
              View saved draft
            </Button>
          )}
        </Stack>
      </Stack>
    </>
  );
}
