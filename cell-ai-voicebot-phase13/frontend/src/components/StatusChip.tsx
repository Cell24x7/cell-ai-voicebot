import Chip, { type ChipProps } from '@mui/material/Chip';

const COLORS: Record<string, ChipProps['color']> = {
  active: 'success',
  invited: 'info',
  disabled: 'default',
  suspended: 'error',
  revoked: 'default',
  // imports / exports (Phase 3)
  completed: 'success',
  ready: 'success',
  validated: 'info',
  validating: 'info',
  importing: 'info',
  processing: 'info',
  pending: 'info',
  failed: 'error',
  canceled: 'default',
  expired: 'default',
  uploaded: 'default',
  mapped: 'default',
};

/** Colored status label (active / invited / disabled / suspended / revoked …). */
export function StatusChip({ status, label }: { status: string; label?: string }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={COLORS[status] ?? 'default'}
      label={label ?? status[0]?.toUpperCase() + status.slice(1)}
    />
  );
}
