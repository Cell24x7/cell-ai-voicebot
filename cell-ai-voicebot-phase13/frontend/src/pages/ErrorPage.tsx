import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useRouteError } from 'react-router';

import { getErrorMessage, isApiError } from '@/services/api/errors';

/** Route error boundary: something crashed while rendering a page. */
export function ErrorPage() {
  const error = useRouteError();
  const requestId = isApiError(error) ? error.requestId : undefined;
  return (
    <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Something went wrong
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
        {getErrorMessage(error)}
      </Typography>
      {requestId && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 2 }}>
          Ref: {requestId}
        </Typography>
      )}
      <Button variant="contained" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </Container>
  );
}
