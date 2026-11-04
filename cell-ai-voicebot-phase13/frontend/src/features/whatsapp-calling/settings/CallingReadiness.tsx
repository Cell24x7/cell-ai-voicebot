import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';

import { useCallingReadiness } from '../queries';

import { READINESS_LABELS } from './readiness';

const icon = (ok: boolean | null) =>
  ok === true ? (
    <CheckCircleOutlined color="success" fontSize="small" titleAccess="Ready" />
  ) : ok === false ? (
    <ErrorOutlineOutlined color="error" fontSize="small" titleAccess="Needs a fix" />
  ) : (
    <HelpOutlineOutlined color="disabled" fontSize="small" titleAccess="Unknown" />
  );

/** Number → Calling: what WhatsApp calling needs on this number, with a fix per item (Phase 18B). */
export function CallingReadiness({ channelId }: { channelId: string }) {
  const readiness = useCallingReadiness(channelId);
  if (readiness.isPending) return <Skeleton variant="rounded" height={120} />;
  if (readiness.isError) return null;
  const { items } = readiness.data;
  return (
    <section aria-label="Calling readiness">
      <Typography variant="body2" color="text.secondary">
        {readiness.data.ready
          ? 'Ready for calling'
          : 'Calling is not ready on this number — fix the items marked red'}
      </Typography>
      <List dense disablePadding>
        {items.map((i) => (
          <ListItem key={i.key} disableGutters>
            <ListItemIcon sx={{ minWidth: 32 }}>{icon(i.ok)}</ListItemIcon>
            <ListItemText
              primary={`${READINESS_LABELS[i.key]}: ${i.detail}`}
              secondary={i.ok === false ? i.fix : null}
            />
          </ListItem>
        ))}
      </List>
    </section>
  );
}

/** Numbers list: a chip while calling can't be switched on (count of failing items). */
export function CallingReadyChip({ channelId }: { channelId: string }) {
  const readiness = useCallingReadiness(channelId);
  if (!readiness.data || readiness.data.ready) return null;
  const failing = readiness.data.items.filter((i) => i.ok === false && i.key !== 'meta_status');
  return (
    <Chip
      size="small"
      variant="outlined"
      color="warning"
      label={`Calling: not ready (${String(failing.length)})`}
    />
  );
}
