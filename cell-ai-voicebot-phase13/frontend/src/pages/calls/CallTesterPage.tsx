import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useSearchParams } from 'react-router';

import { useUnsavedChangesGuard } from '@/components/fields/useUnsavedChangesGuard';
import { PageHeader } from '@/components/PageHeader';
import { CallSetup, type SetupPrefill } from '@/features/calls/tester/CallSetup';
import { CallSummary } from '@/features/calls/tester/CallSummary';
import { LiveCall } from '@/features/calls/tester/LiveCall';
import {
  browserCallDeps,
  isLivePhase,
  useWebCall,
  type WebCallDeps,
} from '@/features/calls/tester/useWebCall';

const LEAVE = {
  title: 'Leave this call?',
  message: 'The test call will be hung up.',
  confirmText: 'Leave',
  cancelText: 'Stay',
};

/** `/calls/test` — a real call in the browser: the mic is the customer. */
export function CallTesterPage({ deps = browserCallDeps }: { deps?: WebCallDeps }) {
  const [params] = useSearchParams();
  const call = useWebCall(deps);
  const { state } = call;
  const live = isLivePhase(state.phase);
  useUnsavedChangesGuard(live, undefined, LEAVE);
  const version = params.get('version');
  const prefill: SetupPrefill = {
    flowId: params.get('flowId'),
    agentId: params.get('agentId'),
    contactId: params.get('contactId'),
    version: version === 'draft' || version === 'published' ? version : null,
  };
  const failure = state.failure;
  // body.variables.amount → variables.amount (the form's field keys)
  const fieldErrors = new Map(
    (failure?.details ?? []).map((d) => [d.path.replace(/^body\./, ''), d.message] as const),
  );
  return (
    <>
      <PageHeader
        title="Test call"
        subtitle="Talk to a flow or an agent through your microphone — use headphones."
      />
      <Stack spacing={2}>
        {state.phase === 'idle' || (state.phase === 'failed' && state.callId === null) ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            {failure && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {failure.message}
              </Alert>
            )}
            <CallSetup
              prefill={prefill}
              busy={live}
              fieldErrors={fieldErrors}
              onStart={(body) => void call.start(body)}
            />
          </Paper>
        ) : (
          <>
            <LiveCall
              state={state}
              onHangup={call.hangup}
              onMute={call.setMuted}
              onKey={call.pressKey}
              onSay={call.sayText}
              onTransfer={call.answerTransfer}
            />
            {(state.phase === 'ended' || state.phase === 'failed') && (
              <CallSummary state={state} onNew={call.reset} />
            )}
          </>
        )}
      </Stack>
    </>
  );
}
