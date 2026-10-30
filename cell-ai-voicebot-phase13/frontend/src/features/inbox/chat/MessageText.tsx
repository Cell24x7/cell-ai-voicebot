import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

import { linkify } from '../format';

/** Customer / agent text as plain text; only http(s) URLs become links (new tab, no opener). */
export function MessageText({ text }: { text: string }) {
  return (
    <Typography
      variant="body2"
      component="div"
      sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
    >
      {linkify(text).map((part, i) =>
        part.href ? (
          <Link key={i} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </Link>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </Typography>
  );
}
