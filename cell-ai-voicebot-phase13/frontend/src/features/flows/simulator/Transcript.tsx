import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useRef } from 'react';

import type { FlowTranscriptEntry } from '@/services/api/types';

const KIND_LABELS: Partial<Record<FlowTranscriptEntry['kind'], string>> = {
  play: 'Audio',
  dtmf: 'Keys',
  ai: 'AI',
  message: 'Message',
  transfer: 'Transfer',
};

function Bubble({ entry, onNode }: { entry: FlowTranscriptEntry; onNode?: (id: string) => void }) {
  if (entry.role === 'system') {
    return (
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ alignSelf: 'center', textAlign: 'center', px: 1 }}
        data-kind={entry.kind}
      >
        {entry.kind === 'message' && entry.meta?.channel === 'whatsapp' ? 'WhatsApp: ' : ''}
        {entry.kind === 'message' && entry.meta?.channel === 'sms' ? 'SMS: ' : ''}
        {entry.text}
      </Typography>
    );
  }
  const bot = entry.role === 'bot';
  const label = KIND_LABELS[entry.kind];
  const fallback = typeof entry.meta?.fallback === 'string' ? entry.meta.fallback : null;
  return (
    <Box
      sx={{
        alignSelf: bot ? 'flex-start' : 'flex-end',
        maxWidth: '85%',
        bgcolor: bot ? 'action.hover' : 'primary.main',
        color: bot ? 'text.primary' : 'primary.contrastText',
        borderRadius: 2,
        px: 1.5,
        py: 1,
        cursor: bot && entry.nodeId && onNode ? 'pointer' : 'default',
      }}
      onClick={() => entry.nodeId && onNode?.(entry.nodeId)}
      data-kind={entry.kind}
    >
      {(label ?? fallback) && (
        <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
          {label && <Chip size="small" label={label} />}
          {fallback && <Chip size="small" color="warning" label={`Fallback: ${fallback}`} />}
        </Stack>
      )}
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {entry.text}
      </Typography>
    </Box>
  );
}

/** Chat-style transcript of a simulation; scrolls to the newest entry. */
export function Transcript({
  entries,
  onNode,
  footer,
}: {
  entries: FlowTranscriptEntry[];
  onNode?: (id: string) => void;
  footer?: React.ReactNode;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [entries.length]);
  return (
    <Stack spacing={1} role="log" aria-label="Transcript" sx={{ overflowY: 'auto', flex: 1, p: 1 }}>
      {entries.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Nothing said yet.
        </Typography>
      )}
      {entries.map((e) => (
        <Bubble key={e.seq} entry={e} {...(onNode ? { onNode } : {})} />
      ))}
      {footer}
      <div ref={end} />
    </Stack>
  );
}
