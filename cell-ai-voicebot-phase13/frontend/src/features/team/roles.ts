import type { AssignableRole } from '@/services/api/team';

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  agent: 'Agent',
  viewer: 'Viewer',
};

/** Roles the caller may give: admin only by the owner. */
export const assignableRoles = (callerIsOwner: boolean): AssignableRole[] =>
  callerIsOwner ? ['admin', 'manager', 'agent', 'viewer'] : ['manager', 'agent', 'viewer'];
