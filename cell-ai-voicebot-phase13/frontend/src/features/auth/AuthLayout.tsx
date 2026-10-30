import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';

import { APP_LOGO_URL, APP_NAME } from '@/app/brand';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LegalLinks } from '@/features/legal/LegalLinks';

interface AuthLayoutProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/** Centered card for the sign-in / sign-up screens. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        bgcolor: 'background.default',
      }}
    >
      <Box sx={{ position: 'fixed', top: 12, right: 12 }}>
        <ThemeToggle />
      </Box>
      <Stack spacing={2} sx={{ width: '100%', maxWidth: 440 }}>
        <Link
          component={RouterLink}
          to="/"
          underline="none"
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}
        >
          <Box component="img" src={APP_LOGO_URL} alt="" sx={{ width: 40, height: 40 }} />
          <Typography variant="h5" component="p" sx={{ fontWeight: 700 }}>
            {APP_NAME}
          </Typography>
        </Link>
        <Card variant="outlined">
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Typography variant="h5" component="h1" gutterBottom>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {subtitle}
              </Typography>
            )}
            {children}
          </CardContent>
        </Card>
        {footer && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
            {footer}
          </Typography>
        )}
        <LegalLinks />
      </Stack>
    </Box>
  );
}
