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
| Testing | Vitest, React Testing Library, MSW, Playwright |

## Data Model

### `auth.users` (Supabase Auth — managed)

Supabase's built-in auth table. Each player has an entry here. The `players` table references it.

### `players`

Profile data linked to Supabase Auth.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | References `auth.users.id` |
| name | text | Display name |
| email | text (unique) | For reminders, synced from auth |
| phone | text (nullable) | Reserved for future SMS support |
| reminder_email | boolean | Default true. Cron skips if false. |
| reminder_sms | boolean | Default false. Reserved for future use. |
| active | boolean | Default true. Inactive players are excluded from everything. |
| created_at | timestamptz | Default now() |

### `games`

One row per day. Auto-created by the cron job.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Default gen_random_uuid() |
| game_date | date (unique) | One game per day |
| created_at | timestamptz | Default now() |

### `rsvps`

One RSVP per player per game. Upserts on re-response.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Default gen_random_uuid() |
| game_id | uuid (FK → games) | |
| player_id | uuid (FK → players) | |
| status | text | 'in', 'out', or 'maybe' |
| guests | integer | Default 0 |
| note | text (nullable) | Short note, max 140 characters (e.g., "running 15 min late") |
| responded_at | timestamptz | Default now(), updated on re-response |

**Constraint:** UNIQUE(game_id, player_id)

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
- Player roster below, grouped by status, showing name, guest count, and note
- RSVP controls: buttons to set status (In/Out/Maybe), guest count, and a note field
- "Manage Settings" link

**Member view after email click (redirected from `/api/rsvp` with `?status=in|out|maybe`):**
- Same as member view above
- Confirmation banner at top (e.g., "You're In!")
- RSVP edit controls pre-opened so they can adjust guests or add a note

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

### `GET /api/cron/remind`

Triggered by Vercel Cron daily (e.g., 7:00 AM local time).

1. Create today's game row if it doesn't exist (idempotent via unique `game_date`)
2. Query all active players where `reminder_email = true`
3. For each player, generate HMAC-signed tokens for In/Out/Maybe
4. Send a reminder email via Resend with three one-click buttons
5. Secured with a `CRON_SECRET` env var to prevent unauthorized invocation

### `GET /api/rsvp`

Handles magic link RSVP clicks from email.

- Query params: `token`, `status`, `player_id`, `game_id`
- Validates HMAC token
- Upserts RSVP row in Supabase
- Creates a Supabase Auth session (logs the player in)
- Redirects to `/?status=in|out|maybe` (landing page with confirmation banner)

### `POST /api/rsvp`

Handles RSVP updates from the landing page (change status, add guests, add note).

- Requires Supabase Auth session
- Upserts RSVP row

### `POST /api/auth/signup`

Handles new player registration.

- Validates access code against `SIGNUP_CODE`
- Creates Supabase Auth user
- Creates `players` profile row
- Triggers Supabase magic link email for login

## Magic Link Token Design

RSVP email links use HMAC-SHA256 signed tokens, separate from Supabase Auth magic links.

**Token payload:** `player_id:game_id:status:expiry`
**Signed with:** `HMAC_SECRET` env var
**Expiry:** 24 hours from email send time

This keeps RSVP one-click (no login flow required) while still being cryptographically secure. The API route validates the signature and expiry before recording the response.

**Session creation on RSVP click:** After validating the HMAC token and recording the RSVP, the API route uses `supabase.auth.admin.generateLink()` with the service role key to create a session for the player. This logs them in without requiring a separate Supabase magic link flow.

## Email Template

The daily reminder email contains:

- Subject: "OldManHoops — Are you playing today?"
- Three buttons: **I'm In** (green), **I'm Out** (red), **Maybe** (yellow)
- Each button is a link to `/api/rsvp?token=xxx&status=in|out|maybe&player_id=xxx&game_id=xxx`
- Simple HTML email, no framework — Resend handles delivery

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `RESEND_API_KEY` | Resend API key for sending emails |
| `HMAC_SECRET` | Secret for signing RSVP magic link tokens |
| `SIGNUP_CODE` | Shared access code for registration |
| `CRON_SECRET` | Secret to authenticate cron job invocations |

## Testing Strategy

TDD approach — tests written before implementation.

**Unit / Component tests (Vitest + React Testing Library + MSW):**

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
