import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';

import { accountApi } from '@/services/api/account';
import { getErrorMessage } from '@/services/api/errors';
import { saveBlob } from '@/utils/download';
import { formatNumber } from '@/utils/format';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 220 }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

const yesNo = (v: boolean) => (v ? 'On' : 'Off');

/** Settings → Compliance: the rules in force (read only) and a CSV of DND and opt-out changes. */
export function ComplianceTab() {
  const data = useQuery({
    queryKey: ['account-compliance'],
    queryFn: () => accountApi.compliance(),
    meta: { silent: true },
  });
  const download = useMutation({
    mutationFn: () => accountApi.complianceCsv(),
    meta: { silent: true },
    onSuccess: (blob) => saveBlob(blob, 'compliance.csv'),
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  if (data.isPending) return <Skeleton variant="rounded" height={240} />;
  if (data.isError) return <Alert severity="error">{getErrorMessage(data.error)}</Alert>;
  const c = data.data;
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={1.5}>
        <Typography variant="h6">Rules in force</Typography>
        <Row
          label="Calling hours"
          value={`${c.callingWindow.start}–${c.callingWindow.end}, ${c.callingWindow.days
            .map((d) => DAYS[d])
            .join(', ')} (${c.timezone})`}
        />
        <Row label="Widest hours allowed" value={`${c.ceiling.start}–${c.ceiling.end}`} />
        <Row label="AI says it is an AI" value={yesNo(c.aiDisclosureEnabled)} />
        <Row label="Call recording" value={yesNo(c.recordingEnabled)} />
        <Row label="Marketing needs recorded consent" value={yesNo(c.requireOptInForMarketing)} />
        <Row label="Opt-out words" value={c.optOutKeywords.join(', ')} />
        <Typography variant="h6" sx={{ pt: 1 }}>
          Numbers
        </Typography>
        <Row label="Contacts" value={formatNumber(c.counts.contacts)} />
        <Row label="With recorded consent" value={formatNumber(c.counts.withConsent)} />
        <Row label="On the do-not-call list" value={formatNumber(c.counts.dnd)} />
        <Row label="Opted out" value={formatNumber(c.counts.optedOut)} />
        <Row label="Erased or blocked for good" value={formatNumber(c.counts.suppressed)} />
        <div>
          <Button
            variant="outlined"
            disabled={download.isPending}
            onClick={() => download.mutate()}
          >
            Download DND and opt-out changes
          </Button>
        </div>
      </Stack>
    </Paper>
  );
}
