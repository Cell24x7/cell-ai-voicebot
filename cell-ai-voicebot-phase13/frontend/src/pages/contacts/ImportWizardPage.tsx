import { TZDate } from '@date-fns/tz';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router';

import { useConfirm } from '@/components/confirm-context';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { useSession } from '@/features/auth/hooks';
import { MappingStep } from '@/features/contact-imports/MappingStep';
import { OptionsStep } from '@/features/contact-imports/OptionsStep';
import { ProgressStep } from '@/features/contact-imports/ProgressStep';
import { ReviewStep } from '@/features/contact-imports/ReviewStep';
import { SummaryStep } from '@/features/contact-imports/SummaryStep';
import { UploadStep } from '@/features/contact-imports/UploadStep';
import { useImportJob } from '@/features/contact-imports/useImportJob';
import { importKeys } from '@/features/contacts/keys';
import { useCustomFields } from '@/features/contacts/queries';
import { contactImportsApi, type ImportKind } from '@/services/api/contact-imports';
import { getErrorMessage, toApiError } from '@/services/api/errors';
import type { ImportColumnMapping, ImportJob, ImportOptions } from '@/services/api/types';

const STEPS = {
  contacts: ['Upload', 'Map columns', 'Options', 'Check', 'Import'],
  dnd: ['Upload', 'Map columns', 'Check', 'Add'],
};

/** `/contacts/import[/:jobId]` — upload → map → options → check → import (resumable by URL). */
export function ImportWizardPage() {
  const { jobId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const timezone = useSession()?.account.timezone ?? 'Asia/Kolkata';
  const fields = useCustomFields();
  const job = useImportJob(jobId);
  const [screen, setScreen] = useState<'map' | 'options' | null>(null);
  const [columns, setColumns] = useState<ImportColumnMapping[] | null>(null);
  const kind: ImportKind = job.data?.kind ?? (params.get('kind') === 'dnd' ? 'dnd' : 'contacts');

  const store = (updated: ImportJob) =>
    queryClient.setQueryData(importKeys.detail(updated.id), updated);
  const switchSheet = useMutation({
    mutationFn: (sheet: string) =>
      contactImportsApi.setMapping(jobId ?? '', { sheet, columns: [] }),
    meta: { silent: true },
    onSuccess: (updated) => {
      store(updated);
      setScreen('map');
    },
  });
  const check = useMutation({
    mutationFn: async ({
      cols,
      options,
    }: {
      cols: ImportColumnMapping[];
      options?: ImportOptions;
    }) => {
      await contactImportsApi.setMapping(jobId ?? '', {
        columns: cols,
        ...(options ? { options } : {}),
      });
      return contactImportsApi.validate(jobId ?? '');
    },
    meta: { silent: true },
    onSuccess: (updated) => {
      store(updated);
      setScreen(null);
    },
  });
  const start = useMutation({
    mutationFn: () => contactImportsApi.start(jobId ?? ''),
    meta: { silent: true },
    onSuccess: store,
  });
  const cancel = useMutation({
    mutationFn: () => contactImportsApi.cancel(jobId ?? ''),
    meta: { silent: true },
    onSuccess: store,
  });
  const actionError = check.error ?? start.error ?? cancel.error ?? switchSheet.error;

  const title = kind === 'dnd' ? 'Upload do-not-call numbers' : 'Import contacts';
  const header = (
    <>
      <Button component={RouterLink} to="/contacts/all" startIcon={<ArrowBack />} sx={{ mb: 2 }}>
        Contacts
      </Button>
      <PageHeader title={title} />
    </>
  );

  if (!jobId) {
    return (
      <>
        {header}
        <Stepper activeStep={0} sx={{ mb: 3 }}>
          {STEPS[kind].map((s) => (
            <Step key={s}>
              <StepLabel>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <UploadStep
          kind={kind}
          onUploaded={(created) => {
            store(created);
            void navigate(`/contacts/import/${created.id}`, { replace: true });
          }}
        />
      </>
    );
  }
  if (job.isPending) {
    return (
      <>
        {header}
        <Skeleton variant="rounded" height={240} />
      </>
    );
  }
  if (job.error) {
    return (
      <>
        {header}
        {toApiError(job.error).status === 404 ? (
          <EmptyState title="Import not found" description="It may belong to another account." />
        ) : (
          <Alert severity="error">{getErrorMessage(job.error)}</Alert>
        )}
      </>
    );
  }

  const j = job.data;
  const editable = ['uploaded', 'mapped', 'validated'].includes(j.status);
  const view: 'map' | 'options' | 'progress' | 'review' | 'summary' =
    j.status === 'validating' || j.status === 'importing'
      ? 'progress'
      : j.status === 'validated' && !screen
        ? 'review'
        : editable
          ? (screen ?? 'map')
          : 'summary';
  const steps = STEPS[kind];
  const active = {
    map: 1,
    options: 2,
    review: steps.length - 2,
    progress: j.status === 'importing' ? steps.length - 1 : steps.length - 2,
    summary: steps.length,
  }[view];
  const today = format(new TZDate(new Date(), timezone), 'yyyy-MM-dd');

  const askCancel = async () => {
    const importing = j.status === 'importing';
    const ok = await confirm({
      title: importing ? 'Stop the import?' : 'Cancel this import?',
      message: importing
        ? 'It stops after the current batch. Contacts already imported are kept.'
        : 'The uploaded file is deleted.',
      confirmText: importing ? 'Stop import' : 'Cancel import',
      destructive: true,
    });
    if (ok) cancel.mutate();
  };

  return (
    <>
      {header}
      <Stepper activeStep={active} sx={{ mb: 3 }}>
        {steps.map((s) => (
          <Step key={s}>
            <StepLabel>{s}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {getErrorMessage(actionError)}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        {view === 'map' && (
          <MappingStep
            key={`${j.sheet ?? ''}:${j.status}`}
            job={j}
            fields={fields.data ?? []}
            busy={switchSheet.isPending || check.isPending}
            onSwitchSheet={(sheet) => switchSheet.mutate(sheet)}
            onCancel={() => void askCancel()}
            onNext={(cols) => {
              setColumns(cols);
              if (kind === 'dnd') check.mutate({ cols });
              else setScreen('options');
            }}
          />
        )}
        {view === 'options' && (
          <OptionsStep
            job={j}
            today={today}
            busy={check.isPending}
            onBack={() => setScreen('map')}
            onSubmit={(options) =>
              check.mutate({ cols: columns ?? j.mapping?.columns ?? [], options })
            }
          />
        )}
        {view === 'progress' && <ProgressStep job={j} onCancel={() => void askCancel()} />}
        {view === 'review' && (
          <ReviewStep
            job={j}
            busy={start.isPending}
            onBack={() => setScreen('map')}
            onStart={() => start.mutate()}
          />
        )}
        {view === 'summary' && (
          <SummaryStep
            job={j}
            onAnother={() =>
              void navigate(kind === 'dnd' ? '/contacts/import?kind=dnd' : '/contacts/import')
            }
          />
        )}
      </Paper>
    </>
  );
}
