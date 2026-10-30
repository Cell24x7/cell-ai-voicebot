import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import { Link as RouterLink } from 'react-router';

import { LEGAL_LINKS } from './links';

/** Privacy · Terms · Contact · Data deletion (public pages, no login). */
export function LegalLinks() {
  return (
    <Stack
      component="nav"
      aria-label="Legal"
      direction="row"
      spacing={2}
      sx={{ justifyContent: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
    >
      {LEGAL_LINKS.map((l) => (
        <Link
          key={l.to}
          component={RouterLink}
          to={l.to}
          variant="caption"
          color="text.secondary"
          underline="hover"
        >
          {l.label}
        </Link>
      ))}
    </Stack>
  );
}
