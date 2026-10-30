import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, type ReactNode } from 'react';

import { APP_NAME } from '@/app/brand';

/** Page title (also sets document.title) + optional actions on the right. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      sx={{ mb: 3, justifyContent: 'space-between', alignItems: { sm: 'center' } }}
    >
      <div>
        <Typography variant="h5" component="h1">
          {title}
        </Typography>
        {subtitle && (
          // a div: subtitles hold chips and links (a <p> can't contain a <div>)
          <Typography variant="body2" color="text.secondary" component="div">
            {subtitle}
          </Typography>
        )}
      </div>
      {actions && (
        <Stack direction="row" spacing={1}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
