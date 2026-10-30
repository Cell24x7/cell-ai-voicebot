/** React Query keys (convention: `['<feature>', '<entity>', params?]`, src/README.md). */
export const authKeys = {
  sessions: ['auth', 'sessions'] as const,
  rbac: ['auth', 'rbac'] as const,
};
