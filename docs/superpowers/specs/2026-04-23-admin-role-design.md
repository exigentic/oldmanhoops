# Admin Role

## Purpose

Introduce a per-user admin flag so we can identify specific users as admins. This spec lands the identification mechanism only — no admin capabilities (game management, RSVP overrides, role granting, etc.) ship here. Each capability will be specced and built separately once we have a reliable way to ask "is this user an admin?".

## Scope

- New `players.is_admin` boolean column.
- A server-side helper that answers "is the current user an admin?" given a Supabase client.
- A small "Admin" badge on `/settings` so we can eyeball that the flag is set correctly in the deployed app.
- Unit tests for the helper and the schema.

Out of scope: any admin capability, any admin-only route or UI beyond the settings badge, env-var-driven seeding, an admin management UI, RLS policy changes, JWT/`app_metadata` sync.

## Database

New migration `supabase/migrations/<timestamp>_add_is_admin.sql`:

```sql
ALTER TABLE public.players
  ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
```

No changes to `handle_new_user` — new signups default to `false` via the column default. No RLS policy changes. The existing `players_select_authenticated` policy already lets any authenticated user read every column on `players`, which means `is_admin` is visible to all logged-in members; that is acceptable (the flag is not a secret). The existing `players_update_own` policy still restricts writes to a user's own row, so users cannot self-promote via the normal API surface — only the service role or a direct DB session can flip the flag.

Bootstrap is manual: an operator runs `UPDATE public.players SET is_admin = true WHERE id = '<uuid>';` in Supabase Studio or psql. There is no env-var-driven seeding in this spec.

## Read surface

New file `lib/auth/admin.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function isCurrentUserAdmin(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("players")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (error || !data) return false;
  return data.is_admin === true;
}
```

The helper takes an injected Supabase client rather than constructing one, following the existing convention in the codebase (see `lib/scoreboard.ts`). This keeps it callable from server components, route handlers, and — if ever needed — the browser client, without coupling to any one flavor. It fails closed: any error, missing row, missing user, or non-`true` value yields `false`.

## UI

In `app/settings/page.tsx`, fetch `is_admin` alongside the existing columns:

```ts
const { data: player } = await supabase
  .from("players")
  .select("name, phone, reminder_email, active, is_admin")
  .eq("id", user.id)
  .single();
```

When `player?.is_admin === true`, render a small "Admin" badge next to the "Settings" heading in the page header. Styling: a rounded pill with indigo-tinted background consistent with the rest of the page palette (e.g., `rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5`). No other UI changes, no admin-only navigation, no admin-only routes.

The page continues to call `supabase.auth.getUser()` directly rather than routing through `isCurrentUserAdmin`, because the page already has the user and is fetching the player row anyway — adding a second round-trip would be wasteful. The helper exists for future capability code that does not already have the player row in hand.

## Tests

- **Unit — `tests/unit/auth-admin.test.ts`:** integration-style test (real local Supabase, per the existing pattern) covering `isCurrentUserAdmin`:
  - not logged in → `false`
  - logged in, `is_admin = false` → `false`
  - logged in, `is_admin = true` → `true`
  - logged in but player row missing → `false` (fails closed)
  - underlying query error → `false` (fails closed)
- **Unit — `tests/unit/schema.test.ts`:** extend the `players` column assertions to include `is_admin` with type `boolean`, `NOT NULL`, default `false`.
- **No E2E test.** The badge is a trivial conditional render, and the only path to set the flag is manual SQL (no user-facing flow to exercise).

## Rollout

- Migration applies cleanly to existing rows (default `false` backfills the column).
- No feature flag — there is no user-visible behavior change for non-admins, and the badge for admins is purely cosmetic.
- Post-deploy, set the initial admin with `UPDATE public.players SET is_admin = true WHERE id = '<clay's uuid>';` against the production database.

## Non-goals / future work

- Any admin capability (game scheduling/cancellation, RSVP override, operational triggers like manual reminder-send, roster-with-contact-info view, admin-granting UI). Each will get its own spec.
- Automatic seeding via `ADMIN_EMAIL` env var. Left off deliberately; can be added later without disrupting this spec's data model.
- Syncing `is_admin` into `auth.users.raw_app_meta_data` so it lands in the JWT. Only worth doing once we have RLS policies that need to check admin-ness without a subquery.
- RLS policy changes gating writes on `is_admin`. Deferred until a capability actually needs admin-gated DB writes; at that point we will decide whether to enforce in RLS, in route handlers, or both.
