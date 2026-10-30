import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useMutation } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useMemo, useState } from 'react';

import { usePermission, useSession } from '@/features/auth/hooks';
import { reloadMe } from '@/features/auth/session';
import { accountApi } from '@/services/api/account';
import { getErrorMessage } from '@/services/api/errors';
import type { PublicAccount } from '@/services/api/types';
import { timezoneOptions } from '@/utils/timezone';

// the calling window, call caps and recording live in Settings → Calls
type Draft = Pick<PublicAccount, 'name' | 'timezone' | 'country' | 'defaultLanguage'> & {
  settings: Pick<PublicAccount['settings'], 'aiDisclosureEnabled'>;
};
const draftOf = (a: PublicAccount): Draft => ({
  name: a.name,
  timezone: a.timezone,
  country: a.country,
  defaultLanguage: a.defaultLanguage,
  settings: { aiDisclosureEnabled: a.settings.aiDisclosureEnabled },
});

/** Remounts the form whenever the saved account changes (fresh draft, no effect sync). */
export function AccountTab() {
  const session = useSession();
  const canUpdate = usePermission('account.update');
  const account = session?.account;
  if (!account) return null;
  return (
    <AccountForm
      key={JSON.stringify(draftOf(account))}
      account={account}
      canEdit={canUpdate && account.status !== 'suspended'}
    />
  );
}

function AccountForm({ account, canEdit }: { account: PublicAccount; canEdit: boolean }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(account));
  const zones = useMemo(() => timezoneOptions(), []);
  const save = useMutation({
    mutationFn: (d: Draft) => accountApi.update(d),
    meta: { silent: true },
    onSuccess: async () => {
      await reloadMe().catch(() => undefined);
      enqueueSnackbar('Account settings saved', { variant: 'success' });
    },
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(account));
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setSettings = (patch: Partial<Draft['settings']>) =>
    set({ settings: { ...draft.settings, ...patch } });

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={3}>
        {!canEdit && (
          <Alert severity="info">Only the owner and admins can change these settings.</Alert>
        )}
        {save.error && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              label="Business name"
              value={draft.name}
              disabled={!canEdit}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Autocomplete
              options={zones}
              value={draft.timezone}
              disabled={!canEdit}
              disableClearable
              onChange={(_e, v) => set({ timezone: v })}
              renderInput={(params) => <TextField {...params} label="Timezone" />}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              label="Country (ISO code)"
              value={draft.country}
              disabled={!canEdit}
              onChange={(e) => set({ country: e.target.value.toUpperCase().slice(0, 2) })}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              select
              label="Default call language"
              value={draft.defaultLanguage}
              disabled={!canEdit}
              onChange={(e) => set({ defaultLanguage: e.target.value as Draft['defaultLanguage'] })}
            >
              <MenuItem value="hinglish">Hinglish</MenuItem>
              <MenuItem value="hi">Hindi</MenuItem>
              <MenuItem value="en">English</MenuItem>
            </TextField>
          </Grid>
        </Grid>
        <Stack>
          <FormControlLabel
            control={
              <Switch
                checked={draft.settings.aiDisclosureEnabled}
                disabled={!canEdit}
                onChange={(e) => setSettings({ aiDisclosureEnabled: e.target.checked })}
              />
            }
            label="Tell callers they are speaking with an AI assistant"
          />
        </Stack>
        {canEdit && (
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button disabled={!dirty} onClick={() => setDraft(draftOf(account))}>
              Discard
            </Button>
            <Button
              variant="contained"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate(draft)}
            >
              Save changes
            </Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
