import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import {
  BACKEND_HEALTH_URL,
  E2E_MONGODB_URI,
  E2E_REDIS_URL,
  FRONTEND_PORT,
  FAKE_META_APP_SECRET,
  FRONTEND_URL,
  META_VERIFY_TOKEN,
  SUPERADMIN,
} from './e2e/env';

const backendDir = fileURLToPath(new URL('../cell-ai-voicebot-backend', import.meta.url));
const prepareScript = fileURLToPath(new URL('./e2e/prepare-backend.mjs', import.meta.url));
/** Chromium's fake microphone plays this file (30 s of near silence, backend `npm run fixtures:audio`). */
const fakeMic = fileURLToPath(
  new URL('../cell-ai-voicebot-backend/docs/samples/audio/customer-silence.wav', import.meta.url),
);
/** Phase 12: the agent's fake mic in WhatsApp call specs — a 1 kHz tone the fake customer detects. */
const agentTone = fileURLToPath(
  new URL('../cell-ai-voicebot-backend/docs/samples/audio/agent-tone.wav', import.meta.url),
);
const WA_CALL_SPECS = /calls-wa-.*\.spec\.ts/;
/** `E2E_BACKEND_LOGS=1` prints backend logs (info) — used by the secret-in-logs check. */
const backendLogs = Boolean(process.env.E2E_BACKEND_LOGS);

/**
 * End-to-end tests against the real backend (isolated `cav_e2e` database,
 * Redis db 5) and Mailpit. Needs `npm run infra:up` in the backend first.
 * Secrets (JWT keys …) come from the backend's own .env.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // One worker: specs share the auth rate limiter and the Mailpit inbox.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: FRONTEND_URL,
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: WA_CALL_SPECS,
      use: {
        ...devices['Desktop Chrome'],
        // web test calls: a fake mic (file) and no permission prompt
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${fakeMic}`,
          ],
        },
      },
    },
    {
      // Phase 12: WhatsApp calls — the agent's microphone plays the tone (runs after chromium)
      name: 'chromium-wa-calls',
      testMatch: WA_CALL_SPECS,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone', 'notifications'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${agentTone}`,
          ],
        },
      },
    },
  ],
  webServer: [
    {
      name: 'backend',
      cwd: backendDir,
      command: `node ${prepareScript} && npx tsx --env-file-if-exists=.env src/index.ts`,
      url: BACKEND_HEALTH_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: backendLogs ? 'pipe' : 'ignore',
      stderr: 'pipe',
      // Real env vars win over the backend's .env file.
      env: {
        NODE_ENV: 'development',
        PORT: '5100',
        LOG_LEVEL: backendLogs ? 'info' : 'warn',
        FRONTEND_URL,
        CORS_ORIGINS: FRONTEND_URL,
        MONGODB_URI: E2E_MONGODB_URI,
        REDIS_URL: E2E_REDIS_URL,
        WORKERS_ENABLED: 'true',
        EMAIL_DRIVER: 'smtp',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: '1025',
        SMTP_SECURE: 'false',
        // Phase 4: test payments + the billing simulator (never in production)
        PAYMENT_PROVIDER: 'fake',
        BILLING_SIMULATOR_ENABLED: 'true',
        BILLING_SELLER_STATE_CODE: '08',
        // Phase 5: deterministic fake AI, the dev mock payment API (template functions call it
        // on this backend), private hosts allowed so localhost:5100 is reachable
        AI_PROVIDER: 'fake',
        MOCK_APIS_ENABLED: 'true',
        AI_FUNCTIONS_ALLOW_PRIVATE_HOSTS: 'true',
        APP_URL: 'http://localhost:5100',
        // one sign-up per spec: the whole suite goes over the default 30 per 15 min
        AUTH_RATE_LIMIT_MAX: '500',
        // Phase 9: WhatsApp on the fake Meta provider (signup, webhooks, simulator)
        WHATSAPP_ENABLED: 'true',
        META_PROVIDER: 'fake',
        FAKE_META_APP_SECRET: FAKE_META_APP_SECRET,
        META_WEBHOOK_VERIFY_TOKEN: META_VERIFY_TOKEN,
        // Phase 10: fast fake sent → delivered → read ticks
        FAKE_META_STATUS_DELAYS_MS: '200,500,800',
        // Phase 11: the fake reviews templates after 1 s
        FAKE_META_TEMPLATE_REVIEW_MS: '1000',
        // Phase 12: WhatsApp calls on loopback — fast fake Meta call events, a free UDP range
        FAKE_META_CALL_DELAYS_MS: '100,200,500',
        WA_MEDIA_PORT_MIN: '41000',
        WA_MEDIA_PORT_MAX: '41199',
        WA_STUN_URLS: '',
        // calls to the fake phone at any hour (fake Meta only; never in production)
        WA_CALL_WINDOW_IGNORED: 'true',
        E2E_SUPERADMIN_EMAIL: SUPERADMIN.email,
        E2E_SUPERADMIN_PASSWORD: SUPERADMIN.password,
      },
    },
    {
      name: 'frontend',
      command: `npm run dev -- --port ${FRONTEND_PORT} --strictPort`,
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      // Same origin for API + WebSocket (through the Vite proxy) whatever the port —
      // a developer's .env.local may point VITE_WS_URL at :3100.
      env: { VITE_API_URL: '/api/v1', VITE_WS_URL: '' },
    },
  ],
});
