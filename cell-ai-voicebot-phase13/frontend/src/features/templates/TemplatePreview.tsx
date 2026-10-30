import CallOutlined from '@mui/icons-material/CallOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import ListOutlined from '@mui/icons-material/ListOutlined';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import PhoneInTalkOutlined from '@mui/icons-material/PhoneInTalkOutlined';
import ReplyOutlined from '@mui/icons-material/ReplyOutlined';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import type { PreviewButton, TemplatePreview as Preview } from './preview';

const BUTTON_ICONS: Record<PreviewButton['type'], typeof ReplyOutlined> = {
  QUICK_REPLY: ReplyOutlined,
  URL: OpenInNewOutlined,
  PHONE_NUMBER: CallOutlined,
  COPY_CODE: ContentCopyOutlined,
  VOICE_CALL: PhoneInTalkOutlined,
  OTHER: ReplyOutlined,
};

const MEDIA = {
  image: { icon: ImageOutlined, label: 'Image' },
  video: { icon: VideocamOutlined, label: 'Video' },
  document: { icon: DescriptionOutlined, label: 'Document' },
} as const;

function Header({ header }: { header: NonNullable<Preview['header']> }) {
  if (header.kind === 'text')
    return (
      <Typography variant="subtitle2" sx={{ fontWeight: 700, whiteSpace: 'pre-wrap' }}>
        {header.text}
      </Typography>
    );
  const media = header.kind === 'location' ? null : MEDIA[header.kind];
  const Icon = media?.icon ?? LocationOnOutlined;
  const label =
    header.kind === 'location' ? (header.name ?? 'Location') : (header.fileName ?? media?.label);
  return (
    <Stack
      spacing={0.5}
      sx={{
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'action.hover',
        borderRadius: 1,
        height: 96,
        color: 'text.secondary',
      }}
    >
      <Icon />
      <Typography variant="caption" sx={{ wordBreak: 'break-all', px: 1 }}>
        {label}
      </Typography>
    </Stack>
  );
}

/** WhatsApp-like bubble of a template (samples or real values). Values stay plain text. */
export function TemplatePreview({
  preview,
  label = 'Template preview',
}: {
  preview: Preview;
  label?: string;
}) {
  return (
    <Box
      component="figure"
      aria-label={label}
      sx={{ m: 0, p: 2, bgcolor: 'action.selected', borderRadius: 2, maxWidth: 360 }}
    >
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 1,
          overflow: 'hidden',
        }}
      >
        <Stack spacing={1} sx={{ p: 1.5 }}>
          {preview.header && <Header header={preview.header} />}
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {preview.body || ' '}
          </Typography>
          {preview.footer && (
            <Typography variant="caption" color="text.secondary">
              {preview.footer}
            </Typography>
          )}
          {preview.callPermission && (
            <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
              WhatsApp asks: Allow calls from this business?
            </Typography>
          )}
        </Stack>
        {(preview.buttons.length > 0 || preview.hiddenButtons > 0) && (
          <Box component="ul" aria-label="Buttons" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {preview.buttons.map((b, i) => {
              const Icon = BUTTON_ICONS[b.type];
              return (
                <Box component="li" key={`${b.type}-${String(i)}`}>
                  <Divider />
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                      justifyContent: 'center',
                      alignItems: 'center',
                      py: 1,
                      color: 'primary.main',
                    }}
                    title={b.url}
                  >
                    <Icon fontSize="small" />
                    <Typography variant="body2">{b.text}</Typography>
                  </Stack>
                </Box>
              );
            })}
            {preview.hiddenButtons > 0 && (
              <Box component="li">
                <Divider />
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    justifyContent: 'center',
                    alignItems: 'center',
                    py: 1,
                    color: 'primary.main',
                  }}
                >
                  <ListOutlined fontSize="small" />
                  <Typography variant="body2">See all options</Typography>
                </Stack>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
