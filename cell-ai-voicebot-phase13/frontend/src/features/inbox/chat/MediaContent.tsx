import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import MicOutlined from '@mui/icons-material/MicOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { lazy, Suspense, useState } from 'react';

import type { InboxMessage } from '@/services/api/types';

import { formatBytes, formatDuration } from '../format';
import { isOptimistic } from '../optimistic';
import { useMediaLink, useRetryMedia } from '../queries';

const Lightbox = lazy(() => import('./Lightbox').then((m) => ({ default: m.Lightbox })));

type Media = NonNullable<InboxMessage['media']>;

function MediaState({
  message,
  media,
  canRetry,
}: {
  message: InboxMessage;
  media: Media;
  canRetry: boolean;
}) {
  const retry = useRetryMedia(message.conversationId);
  if (media.status === 'pending') {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 1 }} role="status">
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          {isOptimistic(message) ? 'Uploading…' : 'Downloading…'}
        </Typography>
      </Stack>
    );
  }
  if (media.status === 'expired') {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        This media is no longer available from WhatsApp.
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', py: 1 }}>
      <Typography variant="body2" color="error">
        Couldn&apos;t download this file.
      </Typography>
      {canRetry && (
        <Button size="small" onClick={() => retry.mutate(message.id)} disabled={retry.isPending}>
          Retry
        </Button>
      )}
    </Stack>
  );
}

function DocumentCard({ media, url }: { media: Media; url: string | undefined }) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: 'center', p: 1, borderRadius: 1, bgcolor: 'action.hover', minWidth: 220 }}
    >
      <DescriptionOutlined color="action" aria-hidden />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap title={media.fileName ?? 'Document'}>
          {media.fileName ?? 'Document'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {[media.size === null ? null : formatBytes(media.size), media.mimeType]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      </Box>
      {url && (
        <Button size="small" href={url} download target="_blank" rel="noopener noreferrer">
          Download
        </Button>
      )}
    </Stack>
  );
}

/** Photo / video / audio / voice note / document / sticker with its download state. */
export function MediaContent({
  message,
  canRetry,
}: {
  message: InboxMessage;
  /** `inbox.assign`: may retry a failed download. */
  canRetry: boolean;
}) {
  const media = message.media as Media;
  const ready = media.status === 'ready' && !isOptimistic(message);
  const link = useMediaLink(message.id, ready);
  const url = link.data?.url;
  const [viewing, setViewing] = useState(false);

  if (media.status !== 'ready') {
    return <MediaState message={message} media={media} canRetry={canRetry} />;
  }
  switch (message.type) {
    case 'image':
      return (
        <>
          <ButtonBase
            aria-label="View photo"
            onClick={() => setViewing(true)}
            disabled={!url}
            sx={{ display: 'block', borderRadius: 1, overflow: 'hidden' }}
          >
            {url ? (
              <Box
                component="img"
                src={url}
                alt={message.text ?? 'Photo'}
                loading="lazy"
                sx={{ display: 'block', maxWidth: 260, maxHeight: 260, objectFit: 'cover' }}
              />
            ) : (
              <Box sx={{ width: 220, height: 140, bgcolor: 'action.hover' }} />
            )}
          </ButtonBase>
          {viewing && url && (
            <Suspense fallback={null}>
              <Lightbox url={url} caption={message.text} onClose={() => setViewing(false)} />
            </Suspense>
          )}
        </>
      );
    case 'sticker':
      return url ? (
        <Box component="img" src={url} alt="Sticker" sx={{ width: 120, height: 120 }} />
      ) : (
        <Box sx={{ width: 120, height: 120 }} />
      );
    case 'video':
      return (
        <Box
          component="video"
          controls
          preload="metadata"
          src={url}
          aria-label="Video"
          sx={{ display: 'block', maxWidth: 280, borderRadius: 1, bgcolor: 'common.black' }}
        />
      );
    case 'audio':
      return (
        <Stack spacing={0.5}>
          {media.voice && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <MicOutlined fontSize="small" color="action" aria-hidden />
              <Typography variant="caption" color="text.secondary">
                Voice note
                {media.durationSec !== null ? ` · ${formatDuration(media.durationSec)}` : ''}
              </Typography>
            </Stack>
          )}
          <Box
            component="audio"
            controls
            preload="metadata"
            src={url}
            aria-label={media.voice ? 'Voice note' : 'Audio'}
            sx={{ maxWidth: 260 }}
          />
        </Stack>
      );
    default:
      return <DocumentCard media={media} url={url} />;
  }
}
