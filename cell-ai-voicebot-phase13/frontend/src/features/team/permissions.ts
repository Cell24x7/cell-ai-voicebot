import type { TeamMember } from '@/services/api/types';

export interface MemberPermissions {
  canInvite: boolean;
  canUpdate: boolean;
  canRemove: boolean;
  callerIsOwner: boolean;
  callerId: string;
}

/** Which actions the caller may take on a member (mirrors the backend rules). */
export const memberActions = (m: TeamMember, p: MemberPermissions) => {
  const protectedRow =
    m.isOwner || m.id === p.callerId || (m.role.key === 'admin' && !p.callerIsOwner);
  if (protectedRow) return { invite: false, role: false, status: false, remove: false };
  if (m.status === 'invited')
    return { invite: p.canInvite, role: false, status: false, remove: false };
  return { invite: false, role: p.canUpdate, status: p.canUpdate, remove: p.canRemove };
};
