import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { CallMethodContent } from '@/features/calls/CallMethodDialog';
import { contactsApi } from '@/services/api/contacts';
import type { Contact } from '@/services/api/types';
import { formatPhone } from '@/utils/phone';

/** Calls page (Phase 18B): pick a contact, then ask permission or call on WhatsApp. */
export function NewWhatsAppCallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Contact | null>(null);
  const search = useQuery({
    queryKey: ['contacts', 'pick-for-call', q],
    queryFn: () => contactsApi.list({ q, limit: 10, page: 1 }),
    enabled: open && q.trim().length >= 2,
  });
  const close = () => {
    setPicked(null);
    setQ('');
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>New call</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Autocomplete
            options={search.data?.data ?? []}
            value={picked}
            onChange={(_e, v) => setPicked(v)}
            inputValue={q}
            onInputChange={(_e, v) => setQ(v)}
            filterOptions={(x) => x}
            getOptionLabel={(c) => `${c.name ?? 'No name'} · ${formatPhone(c.phoneE164)}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={search.isFetching}
            noOptionsText={q.trim().length < 2 ? 'Type a name or number' : 'No contacts'}
            renderInput={(p) => <TextField {...p} label="Contact" autoFocus />}
          />
          {picked ? (
            <CallMethodContent
              onStarted={close}
              key={picked.id}
              contactId={picked.id}
              phoneE164={picked.phoneE164}
              label={picked.name ?? picked.phoneE164}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              Pick a contact, then choose Normal call or WhatsApp call and the sender.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
