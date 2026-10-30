import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { getErrorMessage, toApiError } from '@/services/api/errors';

import { useSystemInfo } from './api';

/** Shows backend name / version / environment — proves API + proxy end to end. */
export function SystemInfoCard() {
  const { data, error, isPending, isFetching, refetch } = useSystemInfo();

  if (isPending) {
    return (
      <Card variant="outlined" aria-busy="true" aria-label="Loading API status">
        <CardContent>
          <Skeleton width="40%" />
          <Skeleton width="60%" />
          <Skeleton width="30%" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    const { requestId } = toApiError(error);
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" disabled={isFetching} onClick={() => void refetch()}>
            Retry
          </Button>
        }
      >
        <Typography variant="body2">API unavailable: {getErrorMessage(error)}</Typography>
        {requestId && (
          <Typography variant="caption" component="p">
            Ref: {requestId}
          </Typography>
        )}
      </Alert>
    );
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          API status
        </Typography>
        <Stack spacing={0.5}>
          <Typography variant="body1">{data.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            Version {data.version} · {data.env} · Node {data.node}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
