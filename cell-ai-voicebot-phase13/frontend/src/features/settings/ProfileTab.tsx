import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useMutation } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useSession } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { accountApi } from '@/services/api/account';
import { getErrorMessage, toApiError } from '@/services/api/errors';

export function ProfileTab() {
  const session = useSession();
  const [name, setName] = useState(session?.user.name ?? '');
  const [phone, setPhone] = useState(session?.user.phone ?? '');
  const save = useMutation({
    mutationFn: () =>
      accountApi.updateProfile({
        name: name.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
      }),
    meta: { silent: true },
    onSuccess: (me) => {
      useAuthStore.getState().setMe(me);
      enqueueSnackbar('Profile saved', { variant: 'success' });
    },
  });
  const fieldErrors = Object.fromEntries(
    toApiError(save.error).details.map((d) => [d.path.replace(/^body\./, ''), d.message]),
  );
  return (
    <Paper variant="outlined" sx={{ p: 3, maxWidth: 520 }}>
      <Stack spacing={2}>
        {save.error && !Object.keys(fieldErrors).length && (
          <Alert severity="error">{getErrorMessage(save.error)}</Alert>
        )}
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={Boolean(fieldErrors.name)}
          helperText={fieldErrors.name}
        />
        <TextField
          label="Email"
          value={session?.user.email ?? ''}
          disabled
          helperText="Contact your account owner to change your email."
        />
        <TextField
          label="Phone"
          value={phone}
          placeholder="+919876543210"
          onChange={(e) => setPhone(e.target.value)}
          error={Boolean(fieldErrors.phone)}
          helperText={fieldErrors.phone ?? 'International format, optional.'}
        />
        <Button
          variant="contained"
          sx={{ alignSelf: 'flex-start' }}
          disabled={!name.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          Save profile
        </Button>
      </Stack>
    </Paper>
  );
}
