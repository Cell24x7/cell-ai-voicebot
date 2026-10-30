import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';

import { ThemeToggle } from '@/components/ThemeToggle';

import { legalValues } from './config';
import { LegalLinks } from './LegalLinks';

/** Wide public page (legal texts): product name, the content card, legal links. */
export function PublicLayout({ title, children }: { title: string; children: ReactNode }) {
  const { appName } = legalValues().values;
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', px: 2, py: { xs: 3, sm: 5 } }}>
      <Box sx={{ position: 'fixed', top: 12, right: 12 }}>
        <ThemeToggle />
      </Box>
      <Stack spacing={2} sx={{ width: '100%', maxWidth: 820, mx: 'auto' }}>
        <Link component={RouterLink} to="/" underline="none" sx={{ textAlign: 'center' }}>
          <Typography variant="h5" component="p" sx={{ fontWeight: 700 }}>
            {appName}
          </Typography>
        </Link>
        <Card variant="outlined">
          <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
            <Typography variant="h4" component="h1" gutterBottom>
              {title}
            </Typography>
            {children}
          </CardContent>
        </Card>
        <LegalLinks />
      </Stack>
    </Box>
  );
}
