import Tooltip from '@mui/material/Tooltip';
import { formatDistanceToNow } from 'date-fns';

import { useAuthStore } from '@/features/auth/store';
import { formatInAccountTz } from '@/utils/datetime';

/** "3 minutes ago" with the account-timezone time on hover; "—" for null. */
export function RelativeTime({ value }: { value: string | null | undefined }) {
  const timezone = useAuthStore((s) => s.session?.account.timezone ?? 'Asia/Kolkata');
  if (!value) return <span>—</span>;
  return (
    <Tooltip title={`${formatInAccountTz(value, timezone)} (${timezone})`}>
      <time dateTime={value}>{formatDistanceToNow(new Date(value), { addSuffix: true })}</time>
    </Tooltip>
  );
}
