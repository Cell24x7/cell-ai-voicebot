import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { getErrorMessage } from '@/services/api/errors';
import type { WhatsAppBusinessProfile } from '@/services/api/types';
import { BUSINESS_VERTICALS } from '@/services/api/whatsapp';

import { useCanManageWhatsApp } from '../permissions';
import { useBusinessProfile, useUpdateBusinessProfile, useUploadProfilePhoto } from '../profile';

import { profileProblems, toProfilePatch, verticalLabel, type ProfileDraft } from './profile-form';

const draftOf = (p: WhatsAppBusinessProfile): ProfileDraft => ({
  about: p.about ?? '',
  description: p.description ?? '',
  address: p.address ?? '',
  email: p.email ?? '',
  website1: p.websites[0] ?? '',
  website2: p.websites[1] ?? '',
  vertical: p.vertical ?? 'UNDEFINED',
});

/** Numbers drawer → "Business profile" (whatsapp.manage edits; others read). */
export function BusinessProfileSection({ channelId }: { channelId: string }) {
  const profile = useBusinessProfile(channelId);
  const canEdit = useCanManageWhatsApp();
  return (
    <Stack spacing={1} component="section" aria-label="Business profile">
      <Typography variant="subtitle2">Business profile</Typography>
      {profile.isPending ? (
        <Skeleton variant="rounded" height={120} />
      ) : profile.isError ? (
        <Alert severity="warning">{getErrorMessage(profile.error)}</Alert>
      ) : (
        <ProfileForm
          key={JSON.stringify(profile.data)}
          channelId={channelId}
          profile={profile.data}
          canEdit={canEdit}
        />
      )}
    </Stack>
  );
}

function ProfileForm({
  channelId,
  profile,
  canEdit,
}: {
  channelId: string;
  profile: WhatsAppBusinessProfile;
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState(() => draftOf(profile));
  const save = useUpdateBusinessProfile(channelId);
  const photo = useUploadProfilePhoto(channelId);
  const problems = profileProblems(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(profile));
  const field = (key: keyof ProfileDraft, label: string, max: number, multiline = false) => (
    <TextField
      size="small"
      label={label}
      value={draft[key]}
      disabled={!canEdit}
      multiline={multiline}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      error={Boolean(problems[key])}
      helperText={
        problems[key] ?? (canEdit ? `${String(draft[key].length)} / ${String(max)}` : ' ')
      }
    />
  );
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Avatar
          src={profile.profilePictureUrl ?? undefined}
          alt="Profile photo"
          sx={{ width: 56, height: 56 }}
        />
        {canEdit && (
          <Button component="label" size="small" variant="outlined" disabled={photo.isPending}>
            {photo.isPending ? 'Uploading…' : 'Change photo'}
            <input
              hidden
              type="file"
              accept="image/jpeg,image/png"
              aria-label="Profile photo file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file)
                  photo.mutate(file, {
                    onSuccess: () =>
                      enqueueSnackbar('Profile photo updated', { variant: 'success' }),
                  });
              }}
            />
          </Button>
        )}
      </Stack>
      {photo.isError && <Alert severity="error">{getErrorMessage(photo.error)}</Alert>}
      {field('about', 'About', 139)}
      {field('description', 'Description', 512, true)}
      {field('address', 'Address', 256)}
      {field('email', 'E-mail', 128)}
      {field('website1', 'Website', 256)}
      {field('website2', 'Second website', 256)}
      <TextField
        select
        size="small"
        label="Category"
        value={draft.vertical}
        disabled={!canEdit}
        onChange={(e) => setDraft({ ...draft, vertical: e.target.value })}
      >
        {BUSINESS_VERTICALS.map((v) => (
          <MenuItem key={v} value={v}>
            {verticalLabel(v)}
          </MenuItem>
        ))}
      </TextField>
      {save.isError && <Alert severity="error">{getErrorMessage(save.error)}</Alert>}
      {canEdit && (
        <Button
          variant="contained"
          size="small"
          sx={{ alignSelf: 'flex-start' }}
          disabled={!dirty || Object.keys(problems).length > 0 || save.isPending}
          onClick={() =>
            save.mutate(toProfilePatch(draft, draftOf(profile)), {
              onSuccess: () => enqueueSnackbar('Business profile saved', { variant: 'success' }),
            })
          }
        >
          Save profile
        </Button>
      )}
    </Stack>
  );
}
