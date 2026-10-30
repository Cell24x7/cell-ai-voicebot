import type { SvgIconComponent } from '@mui/icons-material';
import DoneAllOutlined from '@mui/icons-material/DoneAllOutlined';
import DoneOutlined from '@mui/icons-material/DoneOutlined';
import ErrorOutline from '@mui/icons-material/ErrorOutlineOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import Tooltip from '@mui/material/Tooltip';

import type { InboxMessage } from '@/services/api/types';

import { statusLabel, tickKind, type TickKind } from '../labels';

const ICONS: Record<TickKind, SvgIconComponent> = {
  clock: ScheduleOutlined,
  sent: DoneOutlined,
  delivered: DoneAllOutlined,
  read: DoneAllOutlined,
  failed: ErrorOutline,
};

const COLORS: Record<TickKind, 'action' | 'info' | 'error'> = {
  clock: 'action',
  sent: 'action',
  delivered: 'action',
  read: 'info',
  failed: 'error',
};

/** Clock · ✓ · ✓✓ · blue ✓✓ · ⚠ (failed shows Meta's reason on hover). */
export function StatusTicks({ message }: { message: Pick<InboxMessage, 'status' | 'error'> }) {
  const kind = tickKind(message.status);
  if (!kind) return null;
  const Icon = ICONS[kind];
  const icon = (
    <Icon titleAccess={statusLabel(message.status)} color={COLORS[kind]} sx={{ fontSize: 16 }} />
  );
  return kind === 'failed' ? (
    <Tooltip describeChild title={message.error?.reason ?? 'Not delivered'}>
      {icon}
    </Tooltip>
  ) : (
    icon
  );
}
