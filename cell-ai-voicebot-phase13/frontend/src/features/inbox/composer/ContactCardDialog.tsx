import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { contactsApi } from '@/services/api/contacts';
import { getErrorMessage } from '@/services/api/errors';
import { formatPhone } from '@/utils/phone';

/** Share up to `max` contacts (Phase 3 search) as WhatsApp contact cards. */
export function ContactCardDialog({
  max,
  onSend,
  onClose,
}: {
  max: number;
  onSend: (contactIds: string[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const q = useDebouncedValue(search.trim(), 300);
  const contacts = useQuery({
    queryKey: ['contacts', 'card-picker', q],
    queryFn: () => contactsApi.list({ q: q || undefined, limit: 20 }),
    meta: { silent: true },
  });
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="contact-card-title">
      <DialogTitle id="contact-card-title">Share contact cards</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          size="small"
          label="Search contacts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mt: 1 }}
        />
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          {picked.length} of {max} selected
        </Typography>
        {contacts.isPending ? (
          <Skeleton variant="rounded" height={120} sx={{ mt: 1 }} />
        ) : contacts.isError ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            {getErrorMessage(contacts.error)}
          </Alert>
        ) : contacts.data.data.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No contacts found.
          </Typography>
        ) : (
          <List dense>
            {contacts.data.data.map((c) => {
              const checked = picked.includes(c.id);
              return (
                <ListItemButton
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  disabled={!checked && picked.length >= max}
                >
                  <ListItemIcon>
                    <Checkbox
                      edge="start"
                      checked={checked}
                      tabIndex={-1}
                      disableRipple
                      slotProps={{ input: { 'aria-label': c.name ?? formatPhone(c.phoneE164) } }}
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={c.name ?? formatPhone(c.phoneE164)}
                    secondary={formatPhone(c.phoneE164)}
                  />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={picked.length === 0} onClick={() => onSend(picked)}>
          Send {picked.length > 1 ? `${String(picked.length)} cards` : 'card'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
