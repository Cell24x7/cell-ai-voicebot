import MoreVert from '@mui/icons-material/MoreVert';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueueSnackbar } from 'notistack';
import { useState } from 'react';

import { useConfirm } from '@/components/confirm-context';
import { getErrorMessage } from '@/services/api/errors';
import { teamApi, type AssignableRole } from '@/services/api/team';
import type { TeamMember } from '@/services/api/types';

import { teamKeys } from './keys';
import { memberActions, type MemberPermissions } from './permissions';
import { assignableRoles, ROLE_LABELS } from './roles';

export function MemberActions({ member, perms }: { member: TeamMember; perms: MemberPermissions }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const allowed = memberActions(member, perms);
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    meta: { silent: true },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: teamKeys.all }),
    onError: (error) => enqueueSnackbar(getErrorMessage(error), { variant: 'error' }),
  });
  if (!Object.values(allowed).some(Boolean)) return null;

  const act = (fn: () => Promise<unknown>, done: string) => {
    setAnchor(null);
    run.mutate(fn, { onSuccess: () => enqueueSnackbar(done, { variant: 'success' }) });
  };
  const setRole = (roleKey: AssignableRole) =>
    act(
      () => teamApi.update(member.id, { roleKey }),
      `${member.name} is now ${ROLE_LABELS[roleKey]}`,
    );
  const remove = async () => {
    setAnchor(null);
    const ok = await confirm({
      title: `Remove ${member.name}?`,
      message: 'They lose access right away and are signed out.',
      confirmText: 'Remove',
      destructive: true,
    });
    if (ok) act(() => teamApi.remove(member.id), `${member.name} was removed`);
  };
  const revoke = async () => {
    setAnchor(null);
    const ok = await confirm({
      title: `Revoke the invitation for ${member.email}?`,
      confirmText: 'Revoke',
      destructive: true,
    });
    if (ok) act(() => teamApi.revokeInvite(member.id), 'Invitation revoked');
  };

  return (
    <>
      <IconButton
        aria-label={`Actions for ${member.name}`}
        onClick={(e) => setAnchor(e.currentTarget)}
        size="small"
      >
        <MoreVert fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {allowed.invite && (
          <MenuItem
            onClick={() => act(() => teamApi.resendInvite(member.id), 'Invitation sent again')}
          >
            Resend invitation
          </MenuItem>
        )}
        {allowed.invite && <MenuItem onClick={() => void revoke()}>Revoke invitation</MenuItem>}
        {allowed.role &&
          assignableRoles(perms.callerIsOwner)
            .filter((r) => r !== member.role.key)
            .map((r) => (
              <MenuItem key={r} onClick={() => setRole(r)}>
                Make {ROLE_LABELS[r]}
              </MenuItem>
            ))}
        {allowed.status && <Divider />}
        {allowed.status &&
          (member.status === 'active' ? (
            <MenuItem
              onClick={() =>
                act(
                  () => teamApi.update(member.id, { status: 'disabled' }),
                  `${member.name} was disabled`,
                )
              }
            >
              Disable
            </MenuItem>
          ) : (
            <MenuItem
              onClick={() =>
                act(
                  () => teamApi.update(member.id, { status: 'active' }),
                  `${member.name} was enabled`,
                )
              }
            >
              Enable
            </MenuItem>
          ))}
        {allowed.remove && (
          <MenuItem onClick={() => void remove()} sx={{ color: 'error.main' }}>
            Remove
          </MenuItem>
        )}
      </Menu>
    </>
  );
}
