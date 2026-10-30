/** Settings shared by the Playwright config, helpers and specs. */
/** `E2E_FRONTEND_PORT` overrides the dev-server port when 3100 is taken by something else. */
export const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT ?? '3100';
export const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
export const BACKEND_HEALTH_URL = 'http://127.0.0.1:5100/health';
export const MAILPIT_URL = 'http://127.0.0.1:8025';

/** Isolated from the dev database / Redis — wiped by `prepare-backend.mjs` on every run. */
export const E2E_MONGODB_URI = 'mongodb://127.0.0.1:27018/cav_e2e?replicaSet=rs0';
export const E2E_REDIS_URL = 'redis://127.0.0.1:6380/5';

/** Test-only superadmin, created in the throw-away e2e database. Not a real credential. */
export const SUPERADMIN = { email: 'e2e-superadmin@example.com', password: 'e2e-orchid-river-93' };

/** Default password for users the specs create. */
export const PASSWORD = 'blue-tiger-river-42';

/** Fake Meta provider (Phase 9, dev / test only — never a real Meta secret). */
export const FAKE_META_APP_SECRET = 'e2e-fake-meta-app-secret';
export const META_VERIFY_TOKEN = 'e2e-meta-verify-token-0123456789';
