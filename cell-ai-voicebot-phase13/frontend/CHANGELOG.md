# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Phase 13 · Batch 1 (T13.1–T13.4) — Embedded Signup v4, legal pages, staging build** — 2026-10-26
  - Embedded Signup v4: `FB.login` sends `extras: {}` for Cloud API numbers (coexistence keeps the Business app feature), no `sessionInfoVersion`; session messages from any https `*.facebook.com` origin, every `FINISH*` event (incl. on-behalf-of migration and grant-only access), `CANCEL` with an `error_message` as an error, `waac_id` passed on; Meta's automatic app event logging switched off; the SDK follows Graph v26.0.
  - Public `/privacy`, `/terms`, `/contact` and the `/data-deletion` instructions (no login): safe Markdown subset (no HTML; `javascript:`, protocol-relative and backslash / control-character links dropped), company details from public `VITE_LEGAL_*`, a Draft banner until approved; links on every auth screen, the user menu and the sign-up consent line; icons (1024 / 512 / 192 / Apple / favicon) + web manifest via `npm run icons`.
  - `scripts/build-web.sh <sha>`: the staging SPA is built on the server from the git archive with public values only.
  - Bundle: JS as one stream 452.0 → 452.8 KB (+0.8 KB; legal pages lazy). E2E: `legal-pages.spec.ts` (3 tests); the Phase 9 data deletion spec follows the new instructions text; 151 total, green twice. Tests: 1304 → 1329.

- **Phase 12 · WhatsApp calling (T12.9–T12.12)** — 2026-10-26
  - API clients and hooks for number calling settings, call permissions, WhatsApp calls (start / answer / decline / hold / transfer, media ticket) and call availability (regenerated types), WS events `whatsapp.call.incoming` / `taken` / `ended_ringing` / `call_permission.updated` and `provider` on call events; a call hours validator sharing its cases with the backend.
  - Number → Calling: on / off with a confirm, call button + countries, call hours (time zone, 2 ranges a day, holidays), callback permission, who answers (team / AI / AI first) with ringing and a ring list, the permission request text, restrictions and why a number can't call. Contact panel calling section (state, Ask to allow calls, history, recent calls); permission and call bubbles.
  - Chat Call button (Request permission · Requested · Call → Call yourself / Call with AI with the cost a minute · Can't call + reason), a call bar on every page (timer, mute, hold, keypad, microphone picker, recording dot, network, AI is talking + Take over, Reconnect, low-wallet warning), a global incoming popup (ring sound, browser notification, first Accept wins, "Taken by …"), the availability toggle; the call bar follows account events and polls the active call every 2 s; cancelled mic / dial work never overwrites a later call.
  - Calls list WhatsApp badge, type and filters; call detail WhatsApp region; wallet lines "WhatsApp call · India · 2:14" and call prices; superadmin calling rates (CSV import + diff, edit, history), call price settings and margin rows; 5 notification icons; dashboard "Today: N WhatsApp calls · M missed".
  - Bundle: main 462.6 → 463.7 KB gzip per file (+1.1 KB), JS as one stream 450.6 → 452.0 KB (+1.4 KB); the call bar, popup, toggle, dialogs, settings and the calling rates tab are lazy.
  - E2E: a second project `chromium-wa-calls` (agent tone as the fake microphone), 23 calling tests in 4 specs; the Phase 9 connect spec expects the fake's 2K limit; 148 total, green twice.
  - Fixed (found by the calling E2E run, each with a unit test): the call bar stayed "Calling…" / "Connecting…" while the agent's socket was open, NaN durations, "Automatic reply" on call bubbles, the bar covered the bottom-right corner.
  - Tests: 1215 → 1304.

- **Phase 11 · Templates + WhatsApp billing (T11.7–T11.12)** — 2026-10-24
  - API clients and hooks for `/whatsapp/templates`, the price preview, wallet WhatsApp fields and the superadmin WhatsApp billing routes (regenerated types), the `whatsapp.template.updated` WS event, 14 template simulator kinds (58 in all), routes `/whatsapp/templates` (tabs follow the URL) and `/admin/whatsapp-billing`, nav **WhatsApp billing** (`LIVE_PHASE = 11`); a validator that mirrors the backend (shared case file) and the preview model.
  - Templates tab, details drawer (preview, reason + Edit and resubmit, usage, variable values, history, delete by language or name) and the builder (every header kind with example upload + progress / cancel, variables + samples, footer, grouped buttons, call permission template, time to live, live preview, field errors).
  - Send template dialog (sources per variable, resolved values, header media / location, preview, cost line, consent note, opted-out / DND blocks, errors in words) from the composer, the window-closed banner and the contact page (start with a template); template bubbles with their buttons; the reply cost hint.
  - Wallet: WhatsApp ledger lines with the chat link, WhatsApp prices, budget, usage and spend; superadmin rate card import + diff + edit, settings, margin + CSV, reconciliation; the account WhatsApp billing region (Meta billing moved there + price override); 7 notification icons; dashboard spend line.
  - Bundle: main 462.0 → 463.7 KB gzip per file (+1.7 KB), JS as one stream 450.1 → 451.9 KB (+1.8 KB); the templates tab, builder, send dialog and the superadmin page are lazy.
  - E2E: 22 template / billing tests in 4 specs; the 5 inbox specs fund the wallet first; 125 total, green twice.
  - Tests: 1048 → 1215.

- **Phase 10 · WhatsApp Inbox (T10.7–T10.12)** — 2026-10-23
  - API clients and hooks for `/inbox/*`, inbox settings and the business profile (regenerated types), 5 `inbox.*` WS events and the `conversation:<id>` topic merge (deduped by id and client id, monotonic ticks, updates that arrive before their message), optimistic sends, polling fallbacks, Inbox in the menu with a live unread badge (`LIVE_PHASE = 10`), routes `/inbox`, `/inbox/:conversationId` (lazy).
  - Inbox page: three / two / stacked panes; conversation list (search with snippets, All · Unread · Mine · Unassigned · Closed, number select, live order, Load more); chat (window countdown, date separators, unread divider, older pages keeping the scroll position, New messages, jump to a quoted message, typing line) with bubbles for every type (text with http(s)-only links, photo + lazy lightbox, video, audio, voice note, document + Download, sticker, download states + Retry, location, contact cards + Add contact, interactive previews and replies, form answers, button replies, orders, system, unsupported, deleted, notes, Business app / history / forwarded / ad labels, quotes, reactions, ticks + failed reason + Retry).
  - Composer: text, emoji (own lazy picker), attachments with caption / progress / cancel / paste, **browser voice notes** (lazy recorder, OGG → WebM → M4A, 10 min, < 1 s discarded), location, contact cards, interactive builder (buttons / list / link button with the API limits and a live preview), reply and react under bubbles, internal notes, Templates (Phase 11) disabled; banners for a closed window (notes still possible), opted out, blocked, number not ready and read only; offline sending paused.
  - Assigned to, Close / Reopen, Block (confirmed) / Unblock, Mark as unread, dev Simulate customer; a full contact panel; contact page Open chat / Start chat and a WhatsApp line; Settings → Inbox (read receipts, opt-out / opt-in keywords, auto replies, notifications, retention); Numbers drawer Business profile with photo; inbox notification icons; dashboard Inbox card.
  - Bundle: main 453.5 → 461.9 KB gzip counted per file (+8.4 KB: the bundler now splits the start-up code into 42 files instead of 18 — the code itself grows +2.7 KB, measured as one gzip stream); Inbox page 20.8 KB, composer dialogs, recorder, emoji picker, lightbox, settings tab, dashboard card, contact button and the menu badge are lazy.
  - E2E: 26 inbox tests in 5 specs ("Done when" both directions incl. a recorded voice note, window + statuses, opt-out + retention + coexistence, roles, entry points); 103 total, green twice; `optimizeDeps.entries` pre-bundles the dependencies of lazy screens (the dev server no longer reloads mid-test).
  - Fixed (found by the inbox E2E run, each with a regression test): the message box shrank to zero width on a narrow chat; React strict mode started the voice recorder twice; the contact panel missed opt-outs until a reload (backend fix from the same run: send / retry responses without the quote and sender).
  - Tests: 803 → 1048.

- **Phase 9 · WhatsApp Connect (T9.8–T9.12)** — 2026-10-22
  - API clients and query hooks for `/whatsapp/*`, the superadmin WhatsApp routes and the public data deletion status (regenerated types), `whatsapp.channel.updated` WS event, WhatsApp in the menu (`LIVE_PHASE = 9`; Reports → Phase 14, Integrations → Phase 15), routes `/whatsapp/numbers`, `/admin/whatsapp`, public `/data-deletion`.
  - Embedded Signup: Meta SDK loaded once (15 s timeout), `WA_EMBEDDED_SIGNUP` listener (origin-checked, any `FINISH*`), `FB.login` with the config id, code response and the coexistence feature type, code sent at once with session ids awaited ≤ 3 s; fake provider: Test signup dialog (`fake.` code with a nonce, session ids like the backend fake).
  - WhatsApp → Numbers: connect wizard (Cloud API / WhatsApp Business app with the calling warning; connected, action needed, needs reconnect, cancelled, Meta error, number in use, pop-ups blocked), number cards (status, quality, mode, limit, name status, billing line with the WhatsApp Manager link, coexistence syncs + Retry sync, reason), Sync now / Retry setup / Enter PIN / Reconnect / Rename / Disconnect for owners and admins, details drawer (ids with copy, Meta statuses, webhook health, history, dev Send test event), live updates + polling while a number settles.
  - Superadmin WhatsApp card (force disconnect with a reason, manual connect, Meta billing with the irreversibility confirm) and WhatsApp setup page (configured flags, webhook / callback URLs, failed events + Replay); bell icons for the 6 WhatsApp notification types; dashboard WhatsApp card; `/data-deletion` page.
  - Bundle: main 451.3 → 454.3 KB gzip (+3.0 KB; every WhatsApp screen lazy).
  - E2E: 16 WhatsApp tests in 4 specs (connect "Done when", outcomes, roles + billing + superadmin, Meta endpoints); 77 total.
  - Tests: 737 → 803.

- **Phase 8 · Campaigns (T8.10–T8.15)** — 2026-10-22
  - API clients and query hooks for every `/campaigns` route (regenerated types), `campaign.status` / `campaign.progress` WS events, Campaigns in the menu (`LIVE_PHASE = 8`), routes `/campaigns`, `/campaigns/new`, `/campaigns/:id`, `/campaigns/:id/edit` (list, wizard and detail as lazy chunks); calling window, schedule and outcome / scenario weight fields.
  - Campaigns list (status, mode, flow, progress, next run, filters, "Load more") and the 5-step wizard (basics, audience with a live preview of who is called and who is skipped, schedule and window, retries / pacing / dry-run simulation, review with the estimate; save on the way, unsaved-changes guard, revision conflicts, Start with an Idempotency-Key; prefilled from flows, lists and segments).
  - Campaign detail: live counters, progress + ETA, answered %, outcomes chart, skips by reason, would-have-cost / spent, live calls, banners (pause reasons with what to do, waiting for the window, scheduled, finished, failed), controls by role and state (cancel can hang up live calls), results (filters, why a contact waits, last 4 digits, call links, polled while active), runs, settings, activity, CSV / XLSX export with progress.
  - Entry points: contact Call now (flow or agent on the simulated line, refusals in words, live status), Test in browser with the contact preselected, call history with the contact's campaigns; flow builder Campaigns (used in / Create campaign); lists and segments Create campaign; dashboard Campaigns card; campaign notification icons; calls list line / campaign / contact filters and "Simulated" badge, call detail "Campaign · attempt N" and "Simulated call"; Settings → Calls with the calling window (moved from Account), TRAI / RBI warning and call caps; superadmin calling limits, Pause all campaigns and resume of platform pauses.
  - Bundle: main 445.9 → 451.4 KB gzip (+5.5 KB; +7.0 KB before lazy-loading the calling widgets, dashboard card, limits card and Settings → Calls); wizard 6.9 KB, detail 5.9 KB, list 3.0 KB.
  - E2E: 17 campaign tests in 5 specs ("Done when" 100-contact dry run with window wait, edit, pause / resume, retries and CSV export; wallet pause → top-up → auto-resume → cancel; skips, callbacks and the daily limit; Call now; roles); 61 green twice; the E2E backend raises `AUTH_RATE_LIMIT_MAX` (one sign-up per spec).
  - Fixed: result rows linked to the contacts tab; the tester's prefilled flow vanished while its picker searched; the contact page kept "Never called" after a Call now; page header subtitles nested chips in a `<p>`; the results table stayed stale with live updates off; a playground message typed while a new conversation was starting went to the previous one (backend fixes from the same runs: the dry-run minimum gap in virtual time, Call now in the contact's call facts and always answered).
  - Tests: 666 → 737.

- **Phase 7 · Calls (T7.10–T7.15)** — 2026-10-16
  - API clients and query hooks for every `/calls` route (regenerated types), `call.*` WS events, Calls in the menu (`LIVE_PHASE = 7`), routes `/calls`, `/calls/test`, `/calls/:id` (tester, detail and list as lazy chunks).
  - Browser audio: `dsp.ts` (downmix, streaming resampler, PCM16, 960-byte framer, ring buffer, level) shared by the capture and playback worklets, `engine.ts` (mic, worklets, speaker, underruns), `media-socket.ts` (`/ws/media` protocol, close codes → messages).
  - Web call tester: flow (published / saved draft) or agent alone, contact or typed values + test phone, mic check with a level meter, connecting / ringing / in call, timer, mute, hang up, keypad, transfer prompt, "Type instead of speaking" (test mode), live transcript (playing / heard / interrupted), latency chips, timeline, fake-voice badge, result and cost, errors (mic, wallet, limits, socket), leave-page guard.
  - Calls list (filters in the URL, cursor "Load more", live updates) and call detail (summary with links, outcome, cost split, quality, timeline, transcript that seeks the recording, recording loaded on demand and refreshed when expired, hang up for live calls; no player for viewers and impersonators).
  - "Test call" in the flow builder and the agent editor, Settings → Calls (recording on / off + notice text; the switch moved from the Account tab), ledger call breakdown, Recent calls on the dashboard.
  - Bundle: main 439.0 → 445.9 KB gzip (+6.9 KB); tester 8.0 KB, detail 3.0 KB, list 2.5 KB, worklets 0.9 + 0.8 KB.
  - E2E: Chromium fake mic; 12 call tests in 2 specs (Loan recovery "Done when" by keypad with transcript, cost, playable recording and ledger charge; Hinglish promise for tomorrow; English agent reply; barge-in; wrong keys → callback; AI silence; empty wallet; 4th live call refused; viewer / agent-role / impersonator); all 44 green twice; backend logs free of secrets, customer words, bot texts, names and phones.
  - Fixed: the tester marked the wrong transcript line as interrupted; the tester result could stay on a skeleton when it read the call before the backend saved it (now listens to `call.ended` and polls while the call is live; found by the fresh-clone E2E run) (backend fixes from the same runs: signed recordings blocked cross-origin and not seekable, the socket left open after a hang up, words lost during the AI opening line).
  - Tests: 614 → 666.

- **Phase 6 · Call flows (T6.10–T6.15)** — 2026-10-12
  - `@xyflow/react` 12.12.0 + `@dagrejs/dagre` 3.1.1; API clients for flows, flow audio and the simulator; Call flows in the menu (`LIVE_PHASE = 6`); live `flow.updated` / `flow.published`; shared field components (`VariablePicker`, `SecretField`, `JsonTemplateField`) moved to `src/components/fields`.
  - Flows list (status, search, duplicate, export, archive, delete guard), template picker with agent pick / create, JSON import, versions page (view, export, restore); agents show "Used in N flows" and name the flows when delete is refused.
  - Builder (lazy chunk): palette, steps with named exits, connect / delete, problems list with badges, save with revision + conflict dialog, live "updated elsewhere" banner, publish dialog, read-only modes, undo / redo (50), copy / paste, auto-layout, keyboard shortcuts.
  - Settings forms for all 15 step types (keys / intents / rules with stable ids, audio upload + play, AI agent pick, API request with secret headers and JSON body, router conditions, assignments), flow settings and variables (rename across steps).
  - Simulator panel (draft / published, typed values or a contact, keypad / speech / silence / transfer / hang up, highlight, values, outcome, trace, cost, wallet / cap banners, retry with the same input id), test call history, run detail page, stats overlay.
  - E2E: 11 flow tests in 5 specs (Loan recovery "Done when" + every branch, builder by hand, versions + files + audio, logic + API security, roles & money); all 32 green twice; backend logs free of secrets, customer texts and phones.
  - Fixed: clicking a step on the canvas never selected it; new steps stacked on top of each other and under the settings panel; restoring a version opened the old cached draft; Validate results were hidden while there were unsaved changes.
  - Tests: 478 → 614.

- **Phase 5 · AI agents & knowledge (T5.10–T5.15)** — 2026-10-10
  - API clients for agents, functions, knowledge, playground and admin AI (regenerated types); AI agents and a new Knowledge item in the menu (`LIVE_PHASE = 5`); live `kb.source.updated` / `agent.updated`.
  - Agents list (search, on / off, duplicate, delete, spend), template picker, editor (Basic, Voice & Language, Limits on one form with changed-field saves, error badges per tab, unsaved-changes guard, reload banner), prompt preview drawer, read-only for readers and impersonators.
  - Functions editor (parameter builder, URL placeholders, write-only secret headers, JSON body, result path), Test panel, built-in tool settings; agent Knowledge tab; knowledge base pages (uploads with progress and client checks, web pages, live status and failure reasons, re-index, Try a question).
  - Playground (typed values or a contact + test phone, chat with retry on the same turn id, tool cards, knowledge refs, cost and tokens, outcome, fallback banners, fake-AI badge); ledger drawer shows AI tokens.
  - Superadmin: AI text / embedding prices in the rate dialogs and history, AI card and AI usage on `/admin/billing`; customers see the AI prices.
  - E2E: 6 AI tests ("Done when" paid / unpaid → promise, knowledge, function security, billing + empty wallet, roles + price change); all 21 green twice; backend logs free of secrets, messages and phones.
  - Fixed (backend): empty tool arguments / variables dropped by MongoDB crashed the playground.
  - Tests: 412 → 478.

- **Phase 4 · Wallet & billing (T4.11–T4.15)** — 2026-10-09
  - API clients for wallet, top-ups, billing profile, invoices, notifications and superadmin billing; `utils/money.ts` (rupee input ⇄ micros with string arithmetic, GST preview, basis points), GSTIN hints; Wallet in the menu (`LIVE_PHASE = 4`), `/admin/billing` for platform admins.
  - Notifications bell in the header (unread badge, latest 20, mark read / all, live count); low / exhausted wallet banner; `wallet.updated` patches the cached wallet without a refetch.
  - Wallet: overview cards, budgets, prices, alerts & budgets dialog; Add money (presets, limits, billing details step, GST review, Razorpay Checkout loader + verify, test payment dialog, confirming poll, done / failed / cancelled); dashboard wallet card.
  - Transactions (URL filters, Load more, details drawer, CSV export), Usage chart (lazy-loaded), Invoices (fresh signed download), Settings → Billing details.
  - Superadmin: account Rates and Wallet tabs (edit / default rates, adjust with confirm and one Idempotency-Key, credit limit, billing simulator), Billing page (month summary with GST, top accounts, payments, payment events, default prices).
  - The platform account has no wallet menu, banner, card or page.
  - Unit tests run offline (unmocked requests fail at once) with a 15 s per-test timeout; the E2E frontend forces same-origin API / WebSocket (a local `VITE_WS_URL` pointed at :3100 broke live updates on :3150).
  - E2E: 5 wallet scenarios (top-up + invoice + receipt, charges with hold / release, alerts, adjustments, roles); all 15 green twice.
  - Tests: 287 → 412.

- **Phase 3 · Contacts (T3.13–T3.18)** — 2026-10-09
  - API clients for contacts, lists, segments, DND, custom fields, imports and exports; `formatCurrencyMicros`, `formatDateOnly`, phone helpers (`libphonenumber-js/min`); Contacts in the menu (`LIVE_PHASE = 3`).
  - Contacts tab: search, filters, sort, column picker, row selection + "select all matching", bulk actions (tags, lists, DND, delete, export), create / edit dialog with typed fields; advanced filter (segment builder, in the URL, save as segment).
  - Contact detail: typed variables, tags / lists inline, opt-out / undo, DND, delete.
  - Import wizard (CSV / XLSX, mapping with new fields, date formats, sheet switch, options, check report + error CSV, live progress with polling fallback, resume, cancel) and DND uploads; Imports & exports page.
  - Lists, Segments (builder, live count), Do-not-call, Fields (reorder, type lock) tabs; export dialog (scopes, columns, progress, fresh download link; hidden while impersonating).
  - Playwright: 5 contact scenarios (sample import "Done when", XLSX, segment + bulk + export, DND roles, agent read-only); `E2E_FRONTEND_PORT`.
  - Fixed: the segment preview re-rendered forever (debounced object identity); fields / lists / DND created by an import showed up only after a reload.
  - Coverage gate: 95 / 90 / 90 / 95. Tests: 187 → 287.

- **Phase 2 · T2.18 — E2E + sign-off** — 2026-10-08
  - Playwright 1.64 (`e2e/`, Chromium): sign-up → code → dashboard; invite manager → menu by role → viewer → disabled; suspend / enable; forgot → reset (other sessions end) → change password; impersonation. Isolated backend DB (`cav_e2e`) + Redis db 5, codes / links from Mailpit. Manual CI workflow `e2e.yml`.
  - Fixed: sidebar covered the left of every page (≥ md); timezones shown / sent by current IANA name (`Asia/Kolkata`).
  - Coverage gate: functions 80 → 85. gitleaks allowlists the test-only passphrases.

- **Phase 2 · T2.17 — Superadmin** — 2026-10-08
  - `/admin/accounts` (search, status filter, pagination) and `/admin/accounts/:id` (overview, users by status, recent activity, Rates placeholder for Phase 4), suspend with reason, enable, impersonate the owner (confirm → dashboard with banner → Stop returns to the account page).

- **Phase 2 · T2.16 — Team + Settings** — 2026-10-08
  - Team: table with search / status filter, invite dialog, resend / revoke, role changes, enable / disable, remove, ownership transfer — actions by permission.
  - Settings tabs: Profile, Security (change password, sessions, sign out everywhere), Account (timezone, language, calling window, recording / AI disclosure; read-only without `account.update` or when suspended), API keys (scopes, key shown once with copy), Audit log (filters, load more, account timezone).

- **Phase 2 · T2.13–T2.15 — Auth + app shell** — 2026-10-08
  - In-memory session store, refresh on 401 (single flight across tabs via Web Locks), `AuthBootstrap`, route guards, realtime on while signed in (`session.revoked`, `user.updated`, account events).
  - Pages: login, signup, email code (6 boxes, paste, resend countdown), forgot / reset password, accept invite; 403, error page, dashboard skeleton.
  - App shell: permission-aware sidebar, header (account, live-updates dot, theme toggle, user menu), suspended / impersonation banners; shared `ConfirmProvider`, `PageHeader`, `DataTable`, `EmptyState`, `StatusChip`, `CopyButton`, `RelativeTime`.
  - Tests: 85 → 187.

- **Phase 1 · T1.15** — 2026-10-08
  - API types regenerated (`/health`, `/ready`).
  - `ApiError` + `toApiError` (error envelope, network, timeout, canceled, unknown), `getErrorMessage`, `applyFieldErrors` for react-hook-form; axios interceptor + `unwrap()`.
  - React Query error policy: no retry on 4xx, max 2 retries for network / timeout / 5xx, mutations never retry; global toast for unexpected errors (`meta.silent` opt-out, short request reference).
  - Realtime: `RealtimeClient` (ticket per connection, 25 s ping, full-jitter backoff ≤ 30 s, close-code handling, ref-counted topics, dedupe, refetch after reconnect), `RealtimeProvider` (off until Phase 2) and hooks `useWsStatus` / `useWsEvent` / `useWsTopic`.
  - DEV-only `/dev/realtime` page (not in production builds).
  - Home page API status card (`SystemInfoCard`).
  - Tests: 7 → 81.

- **Phase 1 · T1.16** — 2026-10-08
  - Tests for the provider wiring (global toast, realtime off until Phase 2) and the full `App`.
  - Coverage gate (statements 90 · branches 85 · functions 80 · lines 90) in `vite.config.ts`; CI runs `npm run test:coverage`.
  - Tests: 81 → 85.

- **Phase 0** — 2026-10-08
  - Vite 8 + React 19 + MUI 9 + React Router 8 + React Query + notistack scaffold, ESLint 9 / Prettier / Husky / commitlint, Vitest + RTL, generated API types from the backend OpenAPI spec (`npm run gen:api`), GitHub Actions CI.
