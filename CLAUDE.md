# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Next.js dev server (the dev box runs at `http://devbox:3000`, not localhost).
- `npm run build` — production build.
- `npm test` — Jest unit + lightweight integration tests. `jest.config.ts` pins `maxWorkers: 1` because integration tests share the local Supabase DB; do not re-enable parallelism.
- `npm test -- <pattern>` or `npx jest tests/unit/<file>` — single file / pattern.
- `npm run test:e2e` — Playwright suite. `playwright.config.ts` boots `npm run dev -- --port 3000` and reuses an existing server locally (`reuseExistingServer: !CI`).
- `npm run seed:today` — inserts a `games` row for today in the local Supabase.
- `scripts/push-supabase-auth.sh` — push `supabase/templates/*` auth email templates to the hosted project.
- `npx tsc --noEmit` — type check.

Tests require a running local Supabase (`supabase start`). `jest.setup-env.ts` loads `.env.local` into each worker because `next/jest` doesn't propagate env to workers.

## Architecture

### Stack
Next.js 16 App Router + React 19 + Tailwind v4 + Supabase (auth + Postgres) + Resend (email). Deployed on Vercel.

### Data model (`supabase/migrations/*.sql`)
Three tables in `public`: `players` (profile fields keyed to `auth.users.id`; email lives on `auth.users`), `games` (one row per play day, `game_date UNIQUE`, status `scheduled|cancelled|completed`), `rsvps` (unique per `(game_id, player_id)`, status `in|out|maybe`, `guests 0..10`, `note <= 100 chars`). A `handle_new_user` trigger creates the `players` row on auth signup.

### Supabase client flavors (`lib/supabase/`)
Three clients with different trust levels — **do not mix**:
- `server.ts` → RSCs and route handlers, anon key, reads/writes cookies via `next/headers`.
- `browser.ts` → client components, anon key.
- `admin.ts` → service-role key, **server-only**, used for privileged ops (cron jobs, signup). Never import from a client component.

Session refresh lives in `proxy.ts` (root-level middleware equivalent); its matcher skips static assets. All authenticated routes rely on it running first.

### Environment (`lib/env.ts`)
All env reads funnel through this module, which throws at module init if a required var is missing — fail-fast is intentional. `NEXT_PUBLIC_*` vars use literal `process.env.NEXT_PUBLIC_X` access so Next.js can inline them into the client bundle; dynamic `process.env[name]` access would come back `undefined` in the browser. See `.env.example` for the full set.

### Date/timezone (`lib/date.ts`)
`APP_TIMEZONE` (IANA) is the single source of truth for "today." Everything that needs a game date goes through `getToday()` — never `new Date().toISOString().slice(0,10)`. `isGameDay()` enforces M–F.

### Scoreboard (`lib/scoreboard.ts`)
`getTodayScoreboard()` returns a discriminated union `{ state: "no-game" | "cancelled" | "scheduled" }`. Consumers must switch on `state` — there is no "empty scheduled" shape.

### RSVP-from-email (`lib/hmac.ts` + `app/api/auth/email/…`)
Reminder emails carry HMAC-SHA256 signed tokens (`player_id:game_id:status:expires_at`) so a user can RSVP without an active session. `verifyToken` is timing-safe and enforces expiry. Secret lives in `HMAC_SECRET`.

### Cron (`vercel.json` → `/api/cron/*`)
Two scheduled routes: `housekeeping` (07:00 UTC = 2am EST / 3am EDT) and `remind` (13:00 UTC). Both gated by `lib/cron-auth.ts` using the `CRON_SECRET` Bearer token. Failures call `notifyAdmin()` to email `ADMIN_EMAIL`.

### Signup gate
`SIGNUP_CODE_REQUIRED=true` makes `/join` demand `SIGNUP_CODE`. When unset/false, signups are open and `SIGNUP_CODE` is not required — `lib/env.ts` enforces this conditional requirement. UI and validation both honor the flag.

### OG images
`/og/[date]` renders a dynamic count card for the day's game — used by `app/page.tsx`'s `generateMetadata` for social cards.

## Testing notes

- `tests/unit/schema.test.ts` opens a raw `pg` connection to the local Supabase on `SUPABASE_DB_URL` — it's a schema assertion, not a unit test. Requires Supabase to be up.
- `tests/e2e/fixtures.ts` builds its own admin client directly from `process.env` rather than importing `lib/supabase/admin`, because Playwright's dynamic-import loader can't evaluate `lib/env.ts` from a CJS-context fixture. Don't "clean up" that duplication without understanding the loader issue (documented in the fixture).
- E2E tests share the local DB and a single Playwright `webServer`; they are not parallelizable.

## Conventions

- `@/` path alias → project root (wired in `tsconfig.json` and Jest's `moduleNameMapper`).
- Superpowers plans/specs under `docs/superpowers/` are historical snapshots. Do not retroactively edit them when the codebase changes.
- `/tmp/*` is gitignored. Put scratch artifacts (mockups, screenshot scripts, throwaway HTML) in the project's `tmp/` directory so they're viewable from the host, and keep them out of commits.
