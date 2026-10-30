import FiberManualRecord from '@mui/icons-material/FiberManualRecord';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import type {
  WhatsAppTemplateCategory,
  WhatsAppTemplateQuality,
  WhatsAppTemplateStatus,
} from '@/services/api/types';

import { TEMPLATE_CATEGORY, TEMPLATE_QUALITY, TEMPLATE_STATUS } from '../labels';

const CHIP_COLOR = {
  default: 'default',
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'info',
} as const;

/** Status chip; the reason (rejected / paused …) shows in a tooltip. */
export function TemplateStatusChip({
  status,
  reason = null,
}: {
  status: WhatsAppTemplateStatus;
  reason?: string | null;
}) {
  const s = TEMPLATE_STATUS[status];
  const chip = <Chip size="small" variant="outlined" color={CHIP_COLOR[s.tone]} label={s.label} />;
  return reason ? (
    <Tooltip title={reason}>
      <span>{chip}</span>
    </Tooltip>
  ) : (
    chip
  );
}

/** Category chip; a category WhatsApp changed says what it was. */
export function CategoryChip({
  category,
  previous = null,
}: {
  category: WhatsAppTemplateCategory;
  previous?: WhatsAppTemplateCategory | null;
}) {
  const label = TEMPLATE_CATEGORY[category].label;
  return (
    <Chip
      size="small"
      label={
        previous && previous !== category
          ? `${label} (was ${TEMPLATE_CATEGORY[previous].label})`
          : label
      }
    />
  );
}

export function QualityDot({ quality }: { quality: WhatsAppTemplateQuality | null }) {
  const q = TEMPLATE_QUALITY[quality ?? 'UNKNOWN'];
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <FiberManualRecord
        fontSize="inherit"
        color={q.color === 'disabled' ? 'disabled' : q.color}
        aria-hidden
      />
      <Typography variant="caption" color="text.secondary">
        {q.label}
      </Typography>
    </Stack>
  );
}
