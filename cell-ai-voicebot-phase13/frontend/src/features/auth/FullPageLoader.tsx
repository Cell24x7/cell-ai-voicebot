import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

export function FullPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <Box
      sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}
      role="status"
      aria-label={label}
    >
      <CircularProgress />
    </Box>
  );
}
