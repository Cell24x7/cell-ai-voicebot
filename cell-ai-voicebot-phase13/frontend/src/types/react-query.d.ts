import '@tanstack/react-query';

/** `meta.silent: true` → the global error toast is skipped (the screen shows the error itself). */
interface AppQueryMeta extends Record<string, unknown> {
  silent?: boolean;
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: AppQueryMeta;
    mutationMeta: AppQueryMeta;
  }
}
