/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional — defaults to `/api/v1` (dev proxy). */
  readonly VITE_API_URL?: string;
  /** Optional WebSocket base (e.g. `ws://localhost:3100/ws`) — defaults to the page origin. */
  readonly VITE_WS_URL?: string;
  readonly VITE_APP_NAME: string;
  /** Public company details for the legal pages (Phase 13); missing ones show as drafts. */
  readonly VITE_LEGAL_COMPANY?: string;
  readonly VITE_LEGAL_ADDRESS?: string;
  readonly VITE_LEGAL_EMAIL?: string;
  readonly VITE_LEGAL_GRIEVANCE_OFFICER?: string;
  readonly VITE_LEGAL_WEBSITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
