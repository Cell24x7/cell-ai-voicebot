import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Fragment } from 'react';
import { Link as RouterLink } from 'react-router';

import type { Inline, LegalDoc } from './markdown';

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === 'bold') return <strong key={i}>{p.text}</strong>;
        if (p.kind === 'link')
          return p.href.startsWith('/') ? (
            <Link key={i} component={RouterLink} to={p.href}>
              {p.text}
            </Link>
          ) : (
            <Link key={i} href={p.href} target="_blank" rel="noopener noreferrer">
              {p.text}
            </Link>
          );
        return <Fragment key={i}>{p.text}</Fragment>;
      })}
    </>
  );
}

const VARIANT = { 1: 'h4', 2: 'h6', 3: 'subtitle1' } as const;
const TAG = { 1: 'h1', 2: 'h2', 3: 'h3' } as const;

/** Renders a parsed legal document (headings, paragraphs, lists — text only). */
export function LegalDocument({ doc, draft }: { doc: LegalDoc; draft: boolean }) {
  return (
    <Stack spacing={1.5}>
      {draft && (
        <Alert severity="warning" role="status">
          Draft — not approved yet. The final text may change.
        </Alert>
      )}
      {doc.meta.lastUpdated && (
        <Typography variant="body2" color="text.secondary">
          Last updated: {doc.meta.lastUpdated}
        </Typography>
      )}
      {doc.blocks.map((b, i) => {
        if (b.kind === 'heading')
          return (
            <Typography
              key={i}
              variant={VARIANT[b.level]}
              component={TAG[b.level]}
              sx={{ pt: b.level === 1 ? 0 : 1.5, fontWeight: 600 }}
            >
              <InlineText parts={b.inline} />
            </Typography>
          );
        if (b.kind === 'list')
          return (
            <Box key={i} component="ul" sx={{ m: 0, pl: 3 }}>
              {b.items.map((item, j) => (
                <Typography key={j} component="li" variant="body2" sx={{ mb: 0.5 }}>
                  <InlineText parts={item} />
                </Typography>
              ))}
            </Box>
          );
        return (
          <Typography key={i} variant="body2">
            <InlineText parts={b.inline} />
          </Typography>
        );
      })}
    </Stack>
  );
}
