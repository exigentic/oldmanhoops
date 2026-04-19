# OldManHoops — Design Spec

Daily pickup basketball RSVP app for a private group. Single game at a fixed time and location. Players receive a morning email reminder and respond with one click.

## Core Concepts

- **One game per day**, auto-created by the cron job. No admin needed.
- **Code-protected signup** — a shared access code gates registration. The code can be baked into a shareable link (`/join?code=XXX`). The code is stored as an environment variable (`SIGNUP_CODE`).
- **No passwords** — Supabase Auth with magic link login. Sessions managed via `@supabase/ssr`.
- **One-click RSVP from email** — daily reminder emails contain In/Out/Maybe buttons with HMAC-signed tokens. Clicking one records the RSVP and logs the player into the site.
- **Mobile-first** — designed for phones. Small data download, quick initial load. Server-rendered landing page minimizes client JS. Tailwind utility classes keep CSS lean. No heavy component libraries.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js App Router, React, Tailwind CSS (utility classes only, no component library) |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| Email | Resend |
| Cron | Vercel Cron Jobs |
| Deployment | Vercel |
| Testing | Jest, React Testing Library, MSW, Playwright |

## Data Model

### `auth.users` (Supabase Auth — managed)

Supabase's built-in auth table. Each player has an entry here. The `players` table references it.

### `players`

Profile data linked to Supabase Auth. Email lives in `auth.users` (single source of truth) — not duplicated here.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | References `auth.users.id` ON DELETE CASCADE |
| name | text | Display name |
| phone | text (nullable) | Reserved for future SMS support |
| reminder_email | boolean | Default true. Cron skips if false. |
| reminder_sms | boolean | Default false. Reserved for future use. |
| active | boolean | Default true. Inactive players are excluded from everything. |
| created_at | timestamptz | Default now() |

Queries that need email join `players` with `auth.users` on `id`.

### `games`

One row per day. Auto-created by the cron job.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Default gen_random_uuid() |
| game_date | date (unique) | One game per day |
| status | text | Default 'scheduled'. CHECK constraint restricts to 'scheduled', 'cancelled', or 'completed' |
| status_reason | text (nullable) | Free-form reason shown on scoreboard when cancelled (e.g., "Gym closed", "4th of July") |
| created_at | timestamptz | Default now() |

### `rsvps`

One RSVP per player per game. Upserts on re-response.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Default gen_random_uuid() |
| game_id | uuid (FK → games.id) | ON DELETE CASCADE |
| player_id | uuid (FK → players.id) | ON DELETE CASCADE |
| status | text | CHECK constraint restricts to 'in', 'out', or 'maybe' |
| guests | integer | Default 0. CHECK (guests >= 0 AND guests <= 10) |
| note | text (nullable) | Short note, CHECK (char_length(note) <= 100). Example: "running 15 min late" |
| responded_at | timestamptz | Default now(), updated on re-response |

**Constraint:** UNIQUE(game_id, player_id)

## Database Triggers

### `on_auth_user_created`

A Postgres trigger on `auth.users` insert that atomically creates a `players` profile row. Prevents the race condition where an auth user is created but the profile insert fails.

```sql
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.players (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

The signup API calls `supabase.auth.admin.createUser({ email, user_metadata: { name } })`, and the trigger creates the matching `players` row in the same transaction.

## Row-Level Security (RLS)

RLS is enabled on all tables. Policies below.

### `players`
- **SELECT:** any authenticated user (needed for the member roster on the scoreboard)
- **INSERT:** service role only (signup API creates rows server-side)
- **UPDATE:** `auth.uid() = id` (a player can update only their own profile)
- **DELETE:** `auth.uid() = id`

### `games`
- **SELECT:** anyone, including unauthenticated visitors (needed for count cards)
- **INSERT / UPDATE / DELETE:** service role only (cron jobs write, no client writes)

### `rsvps`
- **SELECT:** anyone (needed for count aggregation). The app layer filters names/notes from the visitor view — RLS does not enforce this distinction. A curious visitor querying Supabase directly could see full RSVP data, which is accepted for a private basketball group.
- **INSERT / UPDATE:** `auth.uid() = player_id` (players write only their own RSVPs)
- **DELETE:** `auth.uid() = player_id`

## Pages & Routes

### Landing Page (`/`)

The scoreboard for today's game. Serves all three user states.

**Visitor view (not logged in):**
- Three count cards showing In / Out / Maybe totals
- Counts include guests (total bodies, not just players)
- "Sign Up to Play" button linking to signup
- No player names visible

**Member view (logged in via Supabase session):**
- Same count cards at top
- "Your RSVP" section directly below the count cards, always visible inline (no modal, no accordion). Contains: three status buttons (In/Out/Maybe) with the current choice highlighted, a guest count stepper (- / 0-10 / +), and a note text input (100 char max). Changes POST to `/api/rsvp` and optimistically update the UI.
- Player roster below the RSVP controls, grouped by status, showing name, guest count, and note
- "Manage Settings" link at the bottom

**Member view after email click (redirected from `/api/rsvp` with `?status=in|out|maybe`):**
- Same as member view above (the "Your RSVP" section is always inline, so no extra disclosure is needed)
- Confirmation banner at top (e.g., "You're In!") — only shown when the `?status=` query param matches the current user's actual RSVP status in the database. Prevents spoofed URLs from displaying a fake confirmation.
- Page auto-scrolls / focuses the note input on load, so the player can quickly add a note if desired

**Cancelled game view (any visitor or member):**
- Instead of the scoreboard, shows a "No game today" message with the cancellation reason
- RSVP controls are hidden
- Counts are not shown (no game happening)

**Data loading:** Server Component renders initial state. Client component polls Supabase every 30-60 seconds for updates. Visual reset daily — only today's RSVPs shown. All historical data persisted in the database.

### Signup Page (`/join`)

- Accepts an optional `code` query param to pre-fill the access code
- Fields: name, email, access code (if not pre-filled)
- Validates access code against `SIGNUP_CODE` env var
- Creates a Supabase Auth user and a `players` row
- Sends a magic link email to confirm and log in

### Settings Page (`/settings`)

- Requires Supabase Auth session (logged in)
- Update display name
- Update email address
- Toggle email reminders on/off
- Toggle active status (leave/rejoin the group)
- Phone number field and SMS toggle are not in v1 UI but the schema supports them

### Magic Link Login (`/login`)

- Simple form: enter email, receive a Supabase magic link
- For players who want to access the site without a recent reminder email

## API Routes

### `GET /api/cron/housekeeping`

Triggered by Vercel Cron daily, early in the morning (e.g., 6:00 AM local time). Prepares the day's data state.

1. Update all past-dated games with `status = 'scheduled'` to `status = 'completed'` (self-heals if cron missed prior days)
2. If today is Monday-Friday in `APP_TIMEZONE`: create today's game row if it doesn't exist (idempotent via unique `game_date`, default `status = 'scheduled'`). Weekends are skipped — no game row created.
3. Secured with a `CRON_SECRET` env var to prevent unauthorized invocation
4. Handler is wrapped in a top-level try/catch; on any uncaught error, sends a plain-text notification email via Resend to `ADMIN_EMAIL` with the error message and stack, then re-throws so Vercel marks the invocation as failed

### `GET /api/cron/remind`

Triggered by Vercel Cron daily, after housekeeping runs (e.g., 7:00 AM local time). Sends reminder emails.

1. Query today's game row
2. If today's game has `status = 'cancelled'` (or does not exist), exit early without sending
3. Query all active players where `reminder_email = true`
4. For each player, generate HMAC-signed tokens for In/Out/Maybe, send a reminder email via Resend with three one-click buttons. Each send is wrapped in try/catch — failures are logged to `console.error` with player email and error message (visible in Vercel function logs), and the loop continues with the next player
5. Secured with a `CRON_SECRET` env var to prevent unauthorized invocation
6. Handler is wrapped in a top-level try/catch; on any uncaught error (e.g., DB unreachable), sends a plain-text notification email via Resend to `ADMIN_EMAIL` with the error message and stack, then re-throws so Vercel marks the invocation as failed

### `GET /api/rsvp`

Handles magic link RSVP clicks from email.

- Query params: `token`, `status`, `player_id`, `game_id`
- Validates HMAC token (rejects if invalid, expired, or mismatched)
- Queries the game row; if `status = 'cancelled'` or the game does not exist, redirects to `/?cancelled=1` without recording an RSVP
- Upserts RSVP row in Supabase (server-side via service role client)
- Calls `supabase.auth.admin.generateLink({ type: 'magiclink', email: player.email, options: { redirectTo: '/?status=<status>' } })` to produce a Supabase magic link URL
- Returns a 302 redirect to that Supabase magic link URL
- Supabase processes the magic link, establishes the auth session cookie, then redirects the browser to `/?status=<status>` where the confirmation banner is shown

### `POST /api/rsvp`

Handles RSVP updates from the landing page (change status, add guests, add note).

- Requires Supabase Auth session
- Queries today's game row; if `status = 'cancelled'` or the game does not exist, returns 403 with a "game cancelled" message
- Upserts RSVP row

### `POST /api/auth/signup`

Handles new player registration.

- Validates access code against `SIGNUP_CODE`
- Creates Supabase Auth user via `supabase.auth.admin.createUser()` with `user_metadata: { name }`
- The `players` profile row is created automatically by a database trigger on `auth.users` insert (see Database Triggers below), so the API does not need to insert it directly
- Triggers Supabase magic link email for login

## Magic Link Token Design

RSVP email links use HMAC-SHA256 signed tokens, separate from Supabase Auth magic links.

**Token payload:** `player_id:game_id:status:expiry`
**Signed with:** `HMAC_SECRET` env var
**Expiry:** 8 hours from email send time (covers morning decision window, limits replay risk)

This keeps RSVP one-click (no login flow required) while still being cryptographically secure. The API route validates the signature and expiry before recording the response. Tokens are reusable within the 8-hour window (e.g., a player can click "In" and later click "Out" from the same email) — this is accepted; the limited expiry bounds the replay risk. Players who need to update after expiry use `/login` to get a fresh session.

**Session creation on RSVP click:** After validating the HMAC token and recording the RSVP via the service role client, the API route uses `supabase.auth.admin.generateLink({ type: 'magiclink' })` to produce a Supabase-issued magic link URL for the player. The API redirects the browser to that URL. Supabase consumes the magic link, sets the auth cookies via its standard callback flow, then redirects to `/?status=<status>`. One extra redirect hop, but no custom session plumbing.

## Email Template

The daily reminder email contains:

- Subject: "OldManHoops — Are you playing today?"
- Three buttons: **I'm In** (green), **I'm Out** (red), **Maybe** (yellow)
- Each button is a link to `/api/rsvp?token=xxx&status=in|out|maybe&player_id=xxx&game_id=xxx`
- Simple HTML email, no framework — Resend handles delivery

## Time & Localization

All "today" resolution happens in a single application timezone, configured via the `APP_TIMEZONE` env var (IANA name, default `America/New_York`). This matches the real-world scope: one pickup group in one city.

- **Game schedule:** Monday through Friday at 12:00 PM EST (noon local)
- **`game_date`** is stored as a bare `date` but always represents the calendar day in `APP_TIMEZONE`
- **A utility `getToday()`** returns the current date in `APP_TIMEZONE` — used by cron jobs and scoreboard queries. Never use `new Date()` directly for game-date logic.
- **Weekday check:** the housekeeping cron only creates a game row on Monday-Friday. Weekend days have no game and show "No game today" on the scoreboard.
- **Cron scheduling** in `vercel.json` uses UTC (Vercel requirement). The UTC times are chosen to correspond to the correct local times in `APP_TIMEZONE`, accounting for DST automatically since the app logic uses the TZ name not a fixed offset.
- **DST transitions** are handled transparently by Luxon (or equivalent) using the IANA TZ name.

## Database Migrations

Managed via the Supabase CLI. Migrations are timestamped SQL files stored in `supabase/migrations/`.

- **Local development:** `supabase start` runs a local Postgres + Auth + Studio stack.
- **Creating a migration:** `supabase migration new <name>` creates a new timestamped SQL file.
- **Applying locally:** `supabase db reset` rebuilds the local DB from migrations.
- **Deploying to production:** `supabase db push` applies pending migrations to the remote project.

All schema changes — table creation, RLS policies, triggers, CHECK constraints — live in this migration history.

## Local Development

- **Local Supabase stack:** `supabase start` runs a full local Postgres + Auth + Studio. Migrations auto-applied from `supabase/migrations/`.
- **Environment:** copy `.env.example` to `.env.local`, point `NEXT_PUBLIC_SUPABASE_URL` and keys at the local stack (output by `supabase start`).
- **Resend:** in development, emails are sent to Resend's test addresses (e.g., `delivered@resend.dev`, `bounced@resend.dev`) or intercepted via MSW in tests. The `RESEND_API_KEY` can be a real key with a test recipient, since Resend won't actually deliver to non-verified domains outside production.
- **Running the app:** `npm run dev` starts Next.js on port 3000 pointing at local Supabase.
- **Resetting:** `supabase db reset` rebuilds the local DB from migrations and seeds.

## Deployment Notes

- **Resend free tier:** 100 emails/day, 3,000/month. For a Mon-Fri schedule with up to ~30 players, usage is well within the free tier (max ~600 emails/month). Going beyond 30 active players or adding weekend games may require a paid plan.
- **Resend sending domain:** Resend requires a verified custom domain to send from in production. Verify a domain (e.g., `oldmanhoops.com`) in the Resend dashboard before first production deploy.
- **Supabase:** free tier is sufficient for this scale.
- **Vercel:** Hobby tier supports the needed cron jobs.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `RESEND_API_KEY` | Resend API key for sending emails |
| `HMAC_SECRET` | Secret for signing RSVP magic link tokens |
| `SIGNUP_CODE` | Shared access code for registration. MUST be at least 12 characters of URL-safe random (e.g., output of `openssl rand -base64 12`) to resist brute force |
| `CRON_SECRET` | Secret to authenticate cron job invocations |
| `APP_TIMEZONE` | IANA timezone name (e.g., `America/New_York`) used for resolving "today" |
| `ADMIN_EMAIL` | Email address that receives cron-failure notifications |

## Testing Strategy

TDD approach — tests written before implementation.

**Unit / Component tests (Jest + React Testing Library + MSW):**

| Layer | What | Approach |
|-------|------|----------|
| Token utils | HMAC signing/verification, expiry | Pure unit tests |
| API: `/api/rsvp` | Token validation, upsert logic, session creation | Unit tests, mocked Supabase |
| API: `/api/cron/remind` | Game creation, player query, email dispatch | Unit tests, mocked Supabase + Resend |
| API: `/api/auth/signup` | Code validation, user + profile creation | Unit tests, mocked Supabase |
| Components: Landing page | Visitor vs member view, counts, roster, RSVP controls, confirmation banner | React Testing Library |
| Components: Signup form | Validation, code pre-fill from query param | React Testing Library |

**End-to-end tests (Playwright + MSW):**

| Flow | What |
|------|------|
| Signup | Enter code + details → confirmation email → click link → land on scoreboard as member |
| RSVP from email | Click "I'm In" → land on scoreboard with confirmation banner → add guest + note |
| RSVP from site | Logged-in member changes status from landing page |
| Settings | Log in → update name → toggle reminders off |
| Visitor view | Unauthenticated user sees counts but no names |

MSW mocks Resend in E2E tests so no real emails are sent. External integrations (Supabase schema, Vercel cron scheduling) are verified in deployment.

## Logo

SVG logo sourced from: `https://raw.githubusercontent.com/claym/oldmanhoops/refs/heads/master/src/images/omh.svg`

Used as the site favicon and header branding.

## Out of Scope (v1)

- SMS reminders (schema ready, UI and cron logic deferred)
- Historical RSVP views / calendar (data persisted, no UI)
- Admin dashboard
- Multiple games per day
- Player statistics or attendance tracking UI
- Cancellation notification emails — on cancelled days, the reminder cron silently skips sending. Players learn of cancellations only by visiting the site. Accepted for v1 to keep the email pipeline simple; deferred to a later phase.
