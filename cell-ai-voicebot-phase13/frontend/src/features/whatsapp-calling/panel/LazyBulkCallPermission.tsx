import { lazy, Suspense, type ComponentProps } from 'react';

const Dialog = lazy(async () => ({
  default: (await import('./BulkCallPermissionDialog')).BulkCallPermissionDialog,
}));

/** The bulk permission dialog as its own chunk (Contacts, lists and segments open it). */
export function LazyBulkCallPermission(props: ComponentProps<typeof Dialog>) {
  return (
    <Suspense fallback={null}>
      <Dialog {...props} />
    </Suspense>
  );
}
