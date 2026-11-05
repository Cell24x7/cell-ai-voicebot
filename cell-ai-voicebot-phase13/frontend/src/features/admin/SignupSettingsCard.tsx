import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';

import { adminApi, type SignupSettings } from '@/services/api/admin';
import { getErrorMessage } from '@/services/api/errors';

import { adminKeys } from './keys';

/** Phase 19: who may sign up on their own (no e-mail): everyone, and whether resellers too. */
export function SignupSettingsCard() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: [...adminKeys.all, 'signup-settings'],
    queryFn: () => adminApi.signupSettings(),
    meta: { silent: true },
  });
  const save = useMutation({
    mutationFn: (body: SignupSettings) => adminApi.setSignupSettings(body),
    meta: { silent: true },
    onSuccess: (data) => {
      queryClient.setQueryData([...adminKeys.all, 'signup-settings'], data);
      enqueueSnackbar('Signup settings saved', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(getErrorMessage(err), { variant: 'error' }),
  });
  const s = settings.data;
  if (!s) return null;
  return (
    <Card variant="outlined" component="section" aria-label="Signup" sx={{ mb: 2 }}>
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ alignItems: { sm: 'center' } }}
        >
          <Typography variant="subtitle1" component="h2" sx={{ flexGrow: 1 }}>
            Signup
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={s.open}
                disabled={save.isPending}
                onChange={(e) => save.mutate({ ...s, open: e.target.checked })}
              />
            }
            label="Anyone can sign up"
          />
          <TextField
            select
            size="small"
            label="Reseller signup"
            value={s.resellerSignup}
            disabled={save.isPending || !s.open}
            onChange={(e) =>
              save.mutate({
                ...s,
                resellerSignup: e.target.value as SignupSettings['resellerSignup'],
              })
            }
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="open">Open</MenuItem>
            <MenuItem value="approval">Needs approval</MenuItem>
            <MenuItem value="closed">Closed</MenuItem>
          </TextField>
        </Stack>
      </CardContent>
    </Card>
  );
}
