# Admin Roster Management

## Purpose

Give admins a tool, inline on the home page, to (1) see the full active member list — both responders and non-responders — and (2) set in/maybe/out status for any player on today's game. This unblocks the common workflow of "Bob texted me he's in" and "who still hasn't said anything?".

This is the first admin *capability* (not just identification), so it also bundles the prerequisite RLS hardening flagged in `2026-04-23-admin-role-design.md`: closing the `players.is_admin` self-promotion path before any behavior gates on the flag.

## Scope

- DB trigger preventing non-service-role from changing `players.is_admin`.
- `lib/scoreboard.ts` extension to optionally return non-responders and to expose `playerId` on roster entries.
- New `/api/admin/rsvp` POST route for admins to set any player's status on today's game.
- Inline UI on `/`: a "Not yet responded" group plus per-row in/maybe/out buttons on every roster row (except the admin's own row). Admin-only.
- Tests for the trigger, the scoreboard extension, and the route.

Out of scope: admin-set guests/note (status only), attribution of who set an RSVP, separate `/admin` route, mobile app, mutating past games, mutating cancelled games, surfacing non-responders to non-admin members, an admin-management UI, JWT-claim-based admin checks.

## Database

New migration `supabase/migrations/<timestamp>_protect_is_admin.sql`:

```sql
CREATE OR REPLACE FUNCTION public.prevent_is_admin_change_by_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     AND auth.uid() IS NOT NULL
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'is_admin can only be modified by the service role'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER players_protect_is_admin
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.prevent_is_admin_change_by_user();
```

The guard fires only when:
- The new value of `is_admin` differs from the old, **and**
- There's an authenticated user context (`auth.uid() IS NOT NULL`), **and**
- That user is not the service role.

This shape allows three legitimate write paths to keep working:
1. Service-role API calls (`createAdminClient()`).
2. Direct DB sessions with no JWT context (psql, Supabase Studio's SQL editor) — `auth.uid()` returns NULL there.
3. Updates by an authenticated user that don't touch `is_admin` (e.g., the `/api/profile` allow-list).

It blocks the one path we care about: a logged-in user issuing a raw `PATCH /rest/v1/players?id=eq.<self>` with `{"is_admin": true}`.

We are *not* moving `is_admin` to a separate table or syncing it into JWT claims. The application enforces the admin capability at the route layer (see below); the DB trigger only needs to make the flag itself trustworthy.

## Server: scoreboard data shape

`lib/scoreboard.ts` gains one option and one field, plus surfaces `playerId` on every roster entry:

```ts
export interface RosterEntry {
  playerId: string;   // NEW
  name: string;
  status: RsvpStatus;
  guests: number;
  note: string | null;
}

export type ScoreboardData =
  | { state: "no-game" }
  | { state: "cancelled"; reason: string | null }
  | {
      state: "scheduled";
      counts: { in: number; out: number; maybe: number };
      roster: RosterEntry[] | null;
      nonResponders: { playerId: string; name: string }[] | null;  // NEW
      currentUserRsvp: CurrentRsvp | null;
    };

export async function getTodayScoreboard(
  supabase: SupabaseClient,
  opts: {
    today: string;
    includeRoster: boolean;
    includeNonResponders?: boolean;  // NEW
    userId?: string;
  }
): Promise<ScoreboardData>;
```

When `includeNonResponders` is true and the game is scheduled, the function also queries `select id, name from players where active = true`, then in JS subtracts the set of `player_id`s already in the RSVPs result. The remainder, sorted alphabetically by name, becomes `nonResponders`. When `includeNonResponders` is false (or unset), `nonResponders` is `null` — mirroring the existing `roster: null` convention.

`playerId` is already in the underlying `select` (`player_id`); we just stop dropping it on the way out.

## API: `/api/admin/rsvp`

New file `app/api/admin/rsvp/route.ts`. POST only.

**Request body:** `{ player_id: string (uuid), status: "in" | "maybe" | "out" }`.

**Flow:**
1. `createClient()` → `auth.getUser()`. 401 if missing.
2. `isCurrentUserAdmin(supabase)` → 403 if false.
3. Validate body: `player_id` is a uuid-shaped string, `status` is in the enum. 400 otherwise.
4. Look up today's game by `getToday()`. 404 if none, 403 if cancelled. Mirrors the existing `/api/rsvp` shape.
5. With `createAdminClient()`, look up `(game_id, player_id)` in `rsvps`:
   - If a row exists → `update({ status })`. Preserves `guests` and `note`.
   - If not → `insert({ game_id, player_id, status, guests: 0, note: null })`.
6. 200 `{ ok: true }`.

**Why a separate route from `/api/rsvp`:** `/api/rsvp` writes the *current user's* RSVP from a body of `{status, guests, note}`. The admin route adds `player_id`, drops `guests` and `note`, and uses a different auth path. Keeping them separate keeps each contract narrow and makes auditing the existing self-RSVP route trivial.

**Why a SELECT-then-UPDATE/INSERT instead of upsert:** an upsert with `onConflict` would replace the entire row, which means we'd have to read the existing row first to preserve `guests`/`note`. SELECT-then-write is the same number of round trips and far clearer about intent: "set status, leave the rest alone." The race window (two admins acting on the same row) is acceptable; last write wins, and the only field we touch is the one being changed.

**Why service role:** RLS on `rsvps` only allows a user to write rows where `auth.uid() = player_id`. The admin acts on someone else's row, so the route must use `createAdminClient()`.

## UI

**`app/page.tsx`:**

```ts
const isAdmin = await isCurrentUserAdmin(supabase);
const initial = await getTodayScoreboard(supabase, {
  today,
  includeRoster: !!user,
  includeNonResponders: isAdmin,
  userId: user?.id,
});
// Pass isAdmin and user.id down to <Scoreboard /> via new optional props.
```

**`Scoreboard.tsx`:** new optional props `isAdmin: boolean` and `currentUserId: string | null`. Threads them into `<Roster />`. Owns the refetch on admin actions, reusing the same `onUpdated` mechanism the existing self-RSVP path already uses to refresh the scoreboard.

**`Roster.tsx`:** new optional `admin` prop:

```ts
admin?: {
  currentUserId: string;
  onSetStatus: (playerId: string, next: RsvpStatus) => Promise<void>;
};
```

When `admin` is present:
- Render the existing In / Maybe / Out groups exactly as today.
- Append a fourth `<section>` "Not yet responded" with `text-neutral-500` heading, listing every entry from `nonResponders` (rendered with name in `text-neutral-700`).
- On every row across all four groups, except where `entry.playerId === admin.currentUserId`, render a button cluster on the right side of the row.

**Button cluster:** three round icon buttons, ~32px diameter (`w-8 h-8 rounded-full`), gap 6px:
- `✓` — emerald
- `?` — yellow
- `✗` — red

Current state is the filled variant (`bg-{color}-{500-600} text-white`); the other two are outlined (`bg-white border border-{color}-400 text-{color}-{700-800}`). Non-responders show all three outlined.

**Click behavior:**
1. Disable that row's buttons.
2. POST `/api/admin/rsvp` with `{ player_id, status }`.
3. On success, call the existing scoreboard refetch hook → server pulls fresh data → row moves groups naturally.
4. On error, show a small `text-red-600` line under the player's name and re-enable the buttons.

**Discoverability:** no extra "Admin mode" toggle. The presence of buttons + the non-responders section is the affordance, paired with the existing "Admin" badge on `/settings`.

**Layout fallback:** the row uses `flex items-start justify-between gap-3` with the cluster as `shrink-0`. On narrow viewports this keeps the cluster on the right; on extremely narrow viewports the name will wrap before the cluster collides.

A static mockup of this layout (option B from the brainstorm) was reviewed at `tmp/admin-status-options.html` during design; it is not committed.

## Tests

- **Unit / schema — new `tests/unit/admin-trigger.test.ts`:** raw `pg` connection to the local Supabase using `SUPABASE_DB_URL`. Each case wraps in a transaction with `SET LOCAL role = ...` and `SET LOCAL request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'` so `auth.uid()` and `auth.role()` resolve as Supabase normally would:
  1. `role = 'service_role'`, no JWT: `UPDATE players SET is_admin = true WHERE id = $1` succeeds.
  2. `role = 'authenticated'` with JWT claims for a known player's id: the same update fails with SQLSTATE `42501`.
  3. `role = 'authenticated'` with the same JWT, updating a non-`is_admin` column (e.g., `name`): succeeds (proves the trigger is column-scoped, not table-scoped).
  4. No `role` set, no JWT (default `postgres` superuser session, like Studio's SQL editor): the `is_admin` update succeeds (preserves the bootstrap path).
- **Unit — extend `tests/unit/scoreboard.test.ts`:** integration-style against local Supabase, seeding two players, one with an RSVP and one without:
  - `includeNonResponders: false` → `nonResponders === null`.
  - `includeNonResponders: true` → `nonResponders` contains the non-RSVP'd active player and excludes the responder.
  - Inactive players (`active = false`) never appear in `nonResponders`.
- **Integration — `tests/unit/api-admin-rsvp.test.ts`:** integration-style against local Supabase, exercising the route handler directly:
  - Non-authenticated → 401.
  - Authenticated non-admin → 403.
  - Admin, valid body, no existing RSVP → row inserted with `status` set, `guests = 0`, `note = null`.
  - Admin, valid body, existing RSVP with `guests = 2`, `note = "x"` → status updated, guests and note preserved.
  - Admin, no game today → 404.
  - Admin, game cancelled → 403.
  - Admin, invalid `status` or non-uuid `player_id` → 400.
- **No new E2E test.** The Playwright suite already exercises the self-RSVP flow; the admin path is mechanically the same with a different route, and the unit/integration tests above cover the meaningful behavior. If we later add an admin-only Playwright fixture (admin signup + flag set), an admin RSVP scenario can layer on cheaply.

## Rollout

- Migration applies to the existing schema in one step. No backfill required (only adds a trigger; existing data unaffected).
- Initial admin must already be set (per the prior spec, via psql `UPDATE players SET is_admin = true WHERE id = '<uuid>';` from a session with no `auth.uid()` — which the trigger allows).
- No feature flag. The capability is gated by `is_admin = true`; non-admins see the page exactly as before.
- After deploy, verify on prod by:
  1. As an admin, loading `/` and confirming the "Not yet responded" group renders.
  2. Clicking a status button on a non-responder and confirming they appear in the corresponding group on refresh.
  3. As a non-admin (test account), loading `/` and confirming no extra section, no extra buttons.
  4. From the Supabase Studio SQL editor (or psql), running `UPDATE public.players SET is_admin = true WHERE id = '<test-non-admin>';` to verify that direct DB access still works for bootstrapping. Then verify that the same update via `supabase.from('players').update({is_admin: true}).eq('id', '<self>')` from a logged-in user's browser fails with a permission error.

## Non-goals / future work

- Admin-set guests and note (currently status-only). Likely never needed; if a player needs guests changed they can update themselves.
- Attribution column (`set_by`) on `rsvps`. Add only if "I never RSVP'd" disputes become real.
- A dedicated `/admin` area for game scheduling, cancellation, manual reminder triggers, etc. Each is its own spec.
- JWT-claim-based admin checks. Worth doing once we have RLS policies that need to gate on admin-ness without a subquery.
- An admin-management UI for granting `is_admin`. Currently a one-line psql update — fine for the foreseeable future given the small membership.
- Surfacing non-responders to all members. Decoupled product question; deserves its own brainstorm.
