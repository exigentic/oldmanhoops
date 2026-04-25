# Admin Roster Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins, on the home page, a way to see the full active roster (responders + non-responders) and set in/maybe/out for any player on today's game — with the prerequisite DB trigger that closes the `players.is_admin` self-promotion hole.

**Architecture:** A `BEFORE UPDATE` Postgres trigger blocks non-service-role writes to `players.is_admin`. `lib/scoreboard.ts` grows a `playerId` field on roster entries and an opt-in `nonResponders` array. A new `/api/admin/rsvp` POST route uses the service-role admin client to set any player's status (status only — preserves existing `guests`/`note`). The home page detects admin status via `isCurrentUserAdmin` and threads it into `Scoreboard` → `Roster`, which renders a small icon-circle button cluster (✓ ? ✗) on every roster row except the admin's own, plus a "Not yet responded" section.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + auth), Tailwind v4, Jest (`/** @jest-environment node */` for backend, jsdom + `@testing-library/react` for components), `pg` for raw schema/trigger tests, local Supabase via `supabase start`.

**Spec:** `docs/superpowers/specs/2026-04-24-admin-roster-rsvp-design.md`.

**Branch:** Create a feature branch before starting (project convention: `feature/admin-roster-rsvp`). All commits land on that branch; merge to main after review.

```bash
git checkout -b feature/admin-roster-rsvp
```

**Run tests with:** `npm test -- <pattern>` for a single file, or `npm test` for the full suite. Local Supabase must be up (`supabase start`); the integration-style tests connect to it via `SUPABASE_DB_URL` (defaulting to `postgresql://postgres:postgres@127.0.0.1:55322/postgres`).

---

## Task 1: DB trigger to protect `players.is_admin`

**Files:**
- Create: `supabase/migrations/20260424235229_protect_is_admin.sql`
- Create: `tests/unit/admin-trigger.test.ts`

The trigger must allow:
- Service-role writes (the new admin RSVP route uses these — though it doesn't touch `is_admin`).
- Direct DB sessions with no JWT context (psql / Supabase Studio SQL editor) — so operators can bootstrap admins.
- Any update by an authenticated user that does *not* change `is_admin` (e.g., `/api/profile`'s name/phone updates).

It must block: an authenticated user changing `is_admin` on their own row via raw PostgREST.

- [ ] **Step 1: Write the failing trigger tests**

```ts
// tests/unit/admin-trigger.test.ts
/** @jest-environment node */
import { Pool } from "pg";

const CONN =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

let pool: Pool;

beforeAll(() => {
  pool = new Pool({ connectionString: CONN });
});

afterAll(async () => {
  await pool.end();
});

async function makePlayer(): Promise<string> {
  // Insert via auth.users — the existing handle_new_user trigger creates the players row.
  const res = await pool.query(
    `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
       VALUES (gen_random_uuid(), $1, '', now(), 'authenticated', 'authenticated', '{"name":"Trigger Test"}'::jsonb)
       RETURNING id`,
    [`trigger-test-${Date.now()}-${Math.random()}@example.com`]
  );
  return res.rows[0].id as string;
}

describe("players.is_admin write protection trigger", () => {
  it("blocks an authenticated user from setting is_admin = true on their own row", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const playerId = (
        await client.query(
          `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
             VALUES (gen_random_uuid(), 'self-promote@example.com', '', now(), 'authenticated', 'authenticated', '{"name":"X"}'::jsonb)
             RETURNING id`
        )
      ).rows[0].id;
      // Simulate a PostgREST request as this authenticated user.
      await client.query(`SET LOCAL ROLE authenticated`);
      await client.query(`SET LOCAL request.jwt.claims = $1`, [
        JSON.stringify({ sub: playerId, role: "authenticated" }),
      ]);
      await expect(
        client.query(`UPDATE public.players SET is_admin = true WHERE id = $1`, [playerId])
      ).rejects.toThrow(/is_admin/);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("allows an authenticated user to update non-is_admin columns on their own row", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const playerId = (
        await client.query(
          `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
             VALUES (gen_random_uuid(), 'name-update@example.com', '', now(), 'authenticated', 'authenticated', '{"name":"X"}'::jsonb)
             RETURNING id`
        )
      ).rows[0].id;
      await client.query(`SET LOCAL ROLE authenticated`);
      await client.query(`SET LOCAL request.jwt.claims = $1`, [
        JSON.stringify({ sub: playerId, role: "authenticated" }),
      ]);
      // Should succeed — column-scoped trigger, not table-scoped.
      const res = await client.query(
        `UPDATE public.players SET name = 'Renamed' WHERE id = $1 RETURNING name`,
        [playerId]
      );
      expect(res.rows[0].name).toBe("Renamed");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("allows the service role to set is_admin = true", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const playerId = (
        await client.query(
          `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
             VALUES (gen_random_uuid(), 'service-promote@example.com', '', now(), 'authenticated', 'authenticated', '{"name":"X"}'::jsonb)
             RETURNING id`
        )
      ).rows[0].id;
      await client.query(`SET LOCAL ROLE service_role`);
      // No JWT claims — service role bypasses RLS and trigger should not fire.
      const res = await client.query(
        `UPDATE public.players SET is_admin = true WHERE id = $1 RETURNING is_admin`,
        [playerId]
      );
      expect(res.rows[0].is_admin).toBe(true);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("allows a direct DB session (no JWT, no role switch) to set is_admin", async () => {
    // Mirrors the bootstrap path: psql or Supabase Studio's SQL editor.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const playerId = (
        await client.query(
          `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
             VALUES (gen_random_uuid(), 'bootstrap-promote@example.com', '', now(), 'authenticated', 'authenticated', '{"name":"X"}'::jsonb)
             RETURNING id`
        )
      ).rows[0].id;
      // Default postgres superuser session — no SET ROLE, no claims.
      const res = await client.query(
        `UPDATE public.players SET is_admin = true WHERE id = $1 RETURNING is_admin`,
        [playerId]
      );
      expect(res.rows[0].is_admin).toBe(true);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
```

- [ ] **Step 2: Run the test file to confirm it fails**

```bash
npm test -- admin-trigger
```

Expected: at minimum the first test fails (the UPDATE succeeds because the trigger doesn't exist yet). The other tests likely pass — they're permissive paths.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260424235229_protect_is_admin.sql
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

- [ ] **Step 4: Apply the migration locally**

```bash
supabase db reset
```

This rebuilds the local DB from scratch including the new migration. Expected: completes without errors. The seed/`handle_new_user` paths are unaffected by the trigger (it only fires on UPDATE, not INSERT).

- [ ] **Step 5: Re-run the tests**

```bash
npm test -- admin-trigger
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Run the full schema test to ensure no regressions**

```bash
npm test -- schema
```

Expected: existing `schema.test.ts` continues to pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260424235229_protect_is_admin.sql tests/unit/admin-trigger.test.ts
git commit -m "Block authenticated users from changing players.is_admin"
```

---

## Task 2: Surface `playerId` on `RosterEntry`

**Files:**
- Modify: `lib/scoreboard.ts`
- Modify: `tests/unit/scoreboard.test.ts`
- Modify: `tests/unit/Roster.test.tsx`

`RosterEntry` already has the data internally (`r.player_id`); we just stop dropping it. Required by Task 6's admin button cluster.

- [ ] **Step 1: Update existing roster test fixtures and add a `playerId` assertion**

Update `tests/unit/Roster.test.tsx` to include `playerId` in fixtures (TS will fail to compile without it):

```tsx
// tests/unit/Roster.test.tsx
import { render, screen } from "@testing-library/react";
import { Roster } from "@/app/_components/Roster";
import type { RosterEntry } from "@/lib/scoreboard";

describe("Roster", () => {
  const entries: RosterEntry[] = [
    { playerId: "p-alice", name: "Alice", status: "in", guests: 1, note: "15 min late" },
    { playerId: "p-bob", name: "Bob", status: "in", guests: 0, note: null },
    { playerId: "p-cat", name: "Cat", status: "maybe", guests: 0, note: null },
    { playerId: "p-dave", name: "Dave", status: "out", guests: 0, note: null },
  ];

  it("groups entries by status", () => {
    render(<Roster entries={entries} />);
    expect(screen.getByRole("heading", { name: /^in/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^maybe/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^out/i })).toBeInTheDocument();
  });

  it("shows guest count next to the name when > 0", () => {
    render(<Roster entries={entries} />);
    expect(screen.getByText(/alice/i)).toHaveTextContent("+1");
  });

  it("shows the note", () => {
    render(<Roster entries={entries} />);
    expect(screen.getByText(/15 min late/i)).toBeInTheDocument();
  });

  it("renders nothing when entries are empty", () => {
    render(<Roster entries={[]} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
```

Add a new assertion in `tests/unit/scoreboard.test.ts` that roster entries carry `playerId`. Insert this case at the end of the `describe` block (before the closing `});`):

```ts
  it("includes playerId on roster entries", async () => {
    const date = "2099-04-08";
    const gameId = await seed(date);
    const p1 = await seedPlayer("sb-test-pid@example.com", "PidPlayer");
    try {
      await seedRsvp(gameId, p1, "in");
      const result = await getTodayScoreboard(admin, { today: date, includeRoster: true });
      expect(result.state).toBe("scheduled");
      if (result.state === "scheduled" && result.roster) {
        expect(result.roster).toHaveLength(1);
        expect(result.roster[0]).toEqual(
          expect.objectContaining({ playerId: p1, name: "PidPlayer", status: "in" })
        );
      }
    } finally {
      await cleanup(date);
      await admin.auth.admin.deleteUser(p1);
    }
  });
```

- [ ] **Step 2: Run the failing tests**

```bash
npm test -- scoreboard.test.ts
npm test -- Roster.test.tsx
```

Expected: `Roster.test.tsx` may compile-fail because `RosterEntry` doesn't yet have `playerId`. `scoreboard.test.ts` fails the new "includes playerId" assertion.

- [ ] **Step 3: Update `lib/scoreboard.ts` to surface `playerId`**

Two edits.

(a) Add `playerId` to the interface:

```ts
export interface RosterEntry {
  playerId: string;
  name: string;
  status: RsvpStatus;
  guests: number;
  note: string | null;
}
```

(b) Populate it when building the roster array. The `select` already includes `player_id` (it's used for `currentUserRsvp`). Update the push call inside the `for (const r of rsvps ?? [])` loop:

```ts
      if (opts.includeRoster) {
        roster.push({
          playerId: r.player_id,
          name: extractJoinedName(r.players),
          status: r.status as RsvpStatus,
          guests,
          note: r.note ?? null,
        });
      }
```

- [ ] **Step 4: Re-run both test files**

```bash
npm test -- scoreboard.test.ts
npm test -- Roster.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Type-check the project to catch any other consumer of `RosterEntry`**

```bash
npx tsc --noEmit
```

Expected: clean. (Only `Roster.tsx` consumes `RosterEntry` and it doesn't read fields it didn't already.)

- [ ] **Step 6: Commit**

```bash
git add lib/scoreboard.ts tests/unit/scoreboard.test.ts tests/unit/Roster.test.tsx
git commit -m "Surface playerId on roster entries"
```

---

## Task 3: Add `includeNonResponders` option to scoreboard

**Files:**
- Modify: `lib/scoreboard.ts`
- Modify: `tests/unit/scoreboard.test.ts`

Adds the opt-in `nonResponders: { playerId, name }[] | null` field. When the option is true (and game is scheduled), the function fetches active players and subtracts the responder set in JS.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/scoreboard.test.ts` inside the `describe("getTodayScoreboard", ...)` block:

```ts
  it("returns nonResponders = null when includeNonResponders is false", async () => {
    const date = "2099-05-01";
    const gameId = await seed(date);
    const p1 = await seedPlayer("sb-test-nr1@example.com", "Alice");
    try {
      await seedRsvp(gameId, p1, "in");
      const result = await getTodayScoreboard(admin, { today: date, includeRoster: true });
      expect(result.state).toBe("scheduled");
      if (result.state === "scheduled") {
        expect(result.nonResponders).toBeNull();
      }
    } finally {
      await cleanup(date);
      await admin.auth.admin.deleteUser(p1);
    }
  });

  it("includes active players without RSVPs when includeNonResponders is true", async () => {
    const date = "2099-05-02";
    const gameId = await seed(date);
    const responder = await seedPlayer("sb-test-nr-yes@example.com", "Yes");
    const nonResponder = await seedPlayer("sb-test-nr-no@example.com", "No");
    try {
      await seedRsvp(gameId, responder, "in");
      const result = await getTodayScoreboard(admin, {
        today: date,
        includeRoster: true,
        includeNonResponders: true,
      });
      expect(result.state).toBe("scheduled");
      if (result.state === "scheduled" && result.nonResponders) {
        const ids = result.nonResponders.map((n) => n.playerId);
        expect(ids).toContain(nonResponder);
        expect(ids).not.toContain(responder);
        // entries carry name too
        const noEntry = result.nonResponders.find((n) => n.playerId === nonResponder);
        expect(noEntry?.name).toBe("No");
      }
    } finally {
      await cleanup(date);
      for (const id of [responder, nonResponder]) await admin.auth.admin.deleteUser(id);
    }
  });

  it("excludes inactive players from nonResponders", async () => {
    const date = "2099-05-03";
    const gameId = await seed(date);
    const responder = await seedPlayer("sb-test-nr-r@example.com", "Active");
    const inactive = await seedPlayer("sb-test-nr-inactive@example.com", "Inactive");
    try {
      await seedRsvp(gameId, responder, "in");
      await pool.query(`UPDATE players SET active = false WHERE id = $1`, [inactive]);
      const result = await getTodayScoreboard(admin, {
        today: date,
        includeRoster: true,
        includeNonResponders: true,
      });
      expect(result.state).toBe("scheduled");
      if (result.state === "scheduled" && result.nonResponders) {
        const ids = result.nonResponders.map((n) => n.playerId);
        expect(ids).not.toContain(inactive);
      }
    } finally {
      await cleanup(date);
      for (const id of [responder, inactive]) await admin.auth.admin.deleteUser(id);
    }
  });
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
npm test -- scoreboard.test.ts
```

Expected: the three new tests fail (no such field on the result).

- [ ] **Step 3: Update `lib/scoreboard.ts`**

(a) Update the scheduled-state shape and options:

```ts
export type ScoreboardData =
  | { state: "no-game" }
  | { state: "cancelled"; reason: string | null }
  | {
      state: "scheduled";
      counts: { in: number; out: number; maybe: number };
      roster: RosterEntry[] | null;
      nonResponders: { playerId: string; name: string }[] | null;
      currentUserRsvp: CurrentRsvp | null;
    };

export async function getTodayScoreboard(
  supabase: SupabaseClient,
  opts: {
    today: string;
    includeRoster: boolean;
    includeNonResponders?: boolean;
    userId?: string;
  }
): Promise<ScoreboardData> {
```

(b) Inside the function, just before the final `return`, compute non-responders:

```ts
  let nonResponders: { playerId: string; name: string }[] | null = null;
  if (opts.includeNonResponders) {
    const { data: activePlayers, error: playersErr } = await supabase
      .from("players")
      .select("id, name")
      .eq("active", true);
    if (playersErr) throw playersErr;

    const responderIds = new Set((rsvps ?? []).map((r) => r.player_id));
    nonResponders = (activePlayers ?? [])
      .filter((p) => !responderIds.has(p.id))
      .map((p) => ({ playerId: p.id as string, name: (p.name as string) ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    state: "scheduled",
    counts: { in: inCount, out: outCount, maybe: maybeCount },
    roster: opts.includeRoster ? roster : null,
    nonResponders,
    currentUserRsvp,
  };
```

- [ ] **Step 4: Re-run tests**

```bash
npm test -- scoreboard.test.ts
```

Expected: all PASS, including the three new ones and all existing ones (the new field defaults to `null`).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. The new union variant adds a required `nonResponders` field; consumers that destructure on `state === "scheduled"` and don't reference it are unaffected.

- [ ] **Step 6: Commit**

```bash
git add lib/scoreboard.ts tests/unit/scoreboard.test.ts
git commit -m "Add includeNonResponders option to scoreboard"
```

---

## Task 4: New `/api/admin/rsvp` POST route

**Files:**
- Create: `app/api/admin/rsvp/route.ts`
- Create: `tests/unit/api-admin-rsvp.test.ts`

Validates a `{ player_id, status }` body, requires the caller to be authenticated *and* admin, then uses the service-role admin client to set status only — preserving existing `guests`/`note`.

- [ ] **Step 1: Write the failing tests**

The route uses both `createClient()` (cookie-aware server client for session check) and `createAdminClient()` (service-role) and reads admin status via `isCurrentUserAdmin`. We mock `next/headers` (cookies) the same way `api-profile.test.ts` does, but for behavior past authentication we test the route end-to-end against the real local Supabase using a real admin session.

Two-layer test approach: a few unit-style tests that exercise the early auth/validation paths without a real session (mirroring `api-profile.test.ts`), and integration tests that exercise the success path by constructing a session manually.

For session-required behavior, the simplest path is to manually mint a Supabase session: `admin.auth.admin.createUser` then `admin.auth.admin.generateLink` (magic link) and use the returned `hashed_token` to log in via the cookie-aware client. That's heavyweight; an easier pattern this codebase already uses is to mock `createClient` and `createAdminClient` selectively.

Use the simpler mocking pattern. Write `tests/unit/api-admin-rsvp.test.ts`:

```ts
/** @jest-environment node */
jest.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
}));

import { Pool } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "@/app/api/admin/rsvp/route";
import * as serverModule from "@/lib/supabase/server";
import * as adminAuthModule from "@/lib/auth/admin";

const CONN =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

let pool: Pool;
let admin: ReturnType<typeof createAdminClient>;

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/rsvp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSession(userId: string | null) {
  jest.spyOn(serverModule, "createClient").mockImplementation(
    async () =>
      ({
        auth: {
          getUser: async () => ({
            data: { user: userId ? { id: userId } : null },
            error: null,
          }),
        },
      }) as unknown as Awaited<ReturnType<typeof serverModule.createClient>>
  );
}

function mockIsAdmin(value: boolean) {
  jest.spyOn(adminAuthModule, "isCurrentUserAdmin").mockResolvedValue(value);
}

async function seedPlayer(email: string, name = "P"): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user) throw error ?? new Error("user creation failed");
  return data.user.id;
}

async function seedGame(date: string): Promise<string> {
  await pool.query(`DELETE FROM rsvps WHERE game_id IN (SELECT id FROM games WHERE game_date = $1)`, [date]);
  await pool.query(`DELETE FROM games WHERE game_date = $1`, [date]);
  const res = await pool.query(
    `INSERT INTO games (game_date, status) VALUES ($1, 'scheduled') RETURNING id`,
    [date]
  );
  return res.rows[0].id as string;
}

beforeAll(() => {
  pool = new Pool({ connectionString: CONN });
  admin = createAdminClient();
});

afterAll(async () => {
  await pool.end();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// `getToday` reads the system date in APP_TIMEZONE. We seed today's game using
// the same module so the route's lookup matches.
import { getToday } from "@/lib/date";

describe("POST /api/admin/rsvp", () => {
  it("returns 401 when no session is present", async () => {
    mockSession(null);
    const res = await POST(makeRequest({ player_id: "00000000-0000-0000-0000-000000000000", status: "in" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller is not an admin", async () => {
    mockSession("user-1");
    mockIsAdmin(false);
    const res = await POST(makeRequest({ player_id: "00000000-0000-0000-0000-000000000000", status: "in" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid status", async () => {
    mockSession("user-1");
    mockIsAdmin(true);
    const res = await POST(makeRequest({ player_id: "00000000-0000-0000-0000-000000000000", status: "invalid" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-uuid player_id", async () => {
    mockSession("user-1");
    mockIsAdmin(true);
    const res = await POST(makeRequest({ player_id: "not-a-uuid", status: "in" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when no game exists today", async () => {
    mockSession("user-1");
    mockIsAdmin(true);
    // Ensure no game exists today
    const today = getToday();
    await pool.query(`DELETE FROM rsvps WHERE game_id IN (SELECT id FROM games WHERE game_date = $1)`, [today]);
    await pool.query(`DELETE FROM games WHERE game_date = $1`, [today]);
    const target = await seedPlayer(`admin-rsvp-404-${Date.now()}@example.com`);
    try {
      const res = await POST(makeRequest({ player_id: target, status: "in" }));
      expect(res.status).toBe(404);
    } finally {
      await admin.auth.admin.deleteUser(target);
    }
  });

  it("returns 403 when today's game is cancelled", async () => {
    mockSession("user-1");
    mockIsAdmin(true);
    const today = getToday();
    await pool.query(`DELETE FROM rsvps WHERE game_id IN (SELECT id FROM games WHERE game_date = $1)`, [today]);
    await pool.query(`DELETE FROM games WHERE game_date = $1`, [today]);
    await pool.query(`INSERT INTO games (game_date, status) VALUES ($1, 'cancelled')`, [today]);
    const target = await seedPlayer(`admin-rsvp-cancelled-${Date.now()}@example.com`);
    try {
      const res = await POST(makeRequest({ player_id: target, status: "in" }));
      expect(res.status).toBe(403);
    } finally {
      await pool.query(`DELETE FROM games WHERE game_date = $1`, [today]);
      await admin.auth.admin.deleteUser(target);
    }
  });

  it("inserts a new RSVP with status, guests=0, note=null when none exists", async () => {
    mockSession("user-1");
    mockIsAdmin(true);
    const today = getToday();
    await seedGame(today);
    const target = await seedPlayer(`admin-rsvp-insert-${Date.now()}@example.com`);
    try {
      const res = await POST(makeRequest({ player_id: target, status: "in" }));
      expect(res.status).toBe(200);
      const row = await pool.query(
        `SELECT status, guests, note FROM rsvps WHERE player_id = $1`,
        [target]
      );
      expect(row.rows[0]).toMatchObject({ status: "in", guests: 0, note: null });
    } finally {
      await pool.query(`DELETE FROM rsvps WHERE player_id = $1`, [target]);
      await pool.query(`DELETE FROM games WHERE game_date = $1`, [today]);
      await admin.auth.admin.deleteUser(target);
    }
  });

  it("preserves guests and note when updating an existing RSVP", async () => {
    mockSession("user-1");
    mockIsAdmin(true);
    const today = getToday();
    const gameId = await seedGame(today);
    const target = await seedPlayer(`admin-rsvp-preserve-${Date.now()}@example.com`);
    try {
      await pool.query(
        `INSERT INTO rsvps (game_id, player_id, status, guests, note) VALUES ($1, $2, 'in', 2, 'bringing nephew')`,
        [gameId, target]
      );
      const res = await POST(makeRequest({ player_id: target, status: "out" }));
      expect(res.status).toBe(200);
      const row = await pool.query(
        `SELECT status, guests, note FROM rsvps WHERE player_id = $1`,
        [target]
      );
      expect(row.rows[0]).toMatchObject({ status: "out", guests: 2, note: "bringing nephew" });
    } finally {
      await pool.query(`DELETE FROM rsvps WHERE player_id = $1`, [target]);
      await pool.query(`DELETE FROM games WHERE game_date = $1`, [today]);
      await admin.auth.admin.deleteUser(target);
    }
  });
});
```

- [ ] **Step 2: Run the tests to confirm failure**

```bash
npm test -- api-admin-rsvp
```

Expected: all FAIL — module `@/app/api/admin/rsvp/route` doesn't exist.

- [ ] **Step 3: Write the route**

```ts
// app/api/admin/rsvp/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/auth/admin";
import { getToday } from "@/lib/date";

const VALID_STATUSES = new Set(["in", "out", "maybe"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PostBody {
  player_id?: string;
  status?: string;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await isCurrentUserAdmin(supabase))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }
  const body = raw as PostBody;
  const { player_id, status } = body;
  if (!player_id || typeof player_id !== "string" || !UUID_RE.test(player_id)) {
    return NextResponse.json({ error: "player_id must be a uuid" }, { status: 400 });
  }
  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "status must be in|out|maybe" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: game, error: gameErr } = await adminClient
    .from("games")
    .select("id, status")
    .eq("game_date", getToday())
    .maybeSingle();
  if (gameErr) {
    return NextResponse.json({ error: gameErr.message }, { status: 500 });
  }
  if (!game) {
    return NextResponse.json({ error: "No game today" }, { status: 404 });
  }
  if (game.status === "cancelled") {
    return NextResponse.json({ error: "Game cancelled" }, { status: 403 });
  }

  // Status-only write: SELECT first to avoid clobbering guests/note via upsert.
  const { data: existing, error: existingErr } = await adminClient
    .from("rsvps")
    .select("id")
    .eq("game_id", game.id)
    .eq("player_id", player_id)
    .maybeSingle();
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (existing) {
    const { error: updateErr } = await adminClient
      .from("rsvps")
      .update({ status })
      .eq("game_id", game.id)
      .eq("player_id", player_id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  } else {
    const { error: insertErr } = await adminClient
      .from("rsvps")
      .insert({ game_id: game.id, player_id, status, guests: 0, note: null });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Re-run the tests**

```bash
npm test -- api-admin-rsvp
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/rsvp/route.ts tests/unit/api-admin-rsvp.test.ts
git commit -m "Add /api/admin/rsvp route for admin status overrides"
```

---

## Task 5: Update `/api/scoreboard` GET to include non-responders for admins

**Files:**
- Modify: `app/api/scoreboard/route.ts`

The `Scoreboard` component refreshes via `GET /api/scoreboard` on poll and after admin actions. Without this update, the refresh would drop the `nonResponders` array even for admins.

This route has no existing test file. Skipping a new test is reasonable: it's a 3-line wrapper around `getTodayScoreboard`, which is tested directly. If preferred, add a smoke test mirroring `api-profile.test.ts` shape.

- [ ] **Step 1: Modify the route**

```ts
// app/api/scoreboard/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/date";
import { getTodayScoreboard } from "@/lib/scoreboard";
import { isCurrentUserAdmin } from "@/lib/auth/admin";

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdmin = user ? await isCurrentUserAdmin(supabase) : false;

  const data = await getTodayScoreboard(supabase, {
    today: getToday(),
    includeRoster: !!user,
    includeNonResponders: isAdmin,
    userId: user?.id,
  });

  return NextResponse.json(data);
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Run the related tests to confirm no regressions**

```bash
npm test -- scoreboard
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/scoreboard/route.ts
git commit -m "Include non-responders in scoreboard refresh for admins"
```

---

## Task 6: Roster admin mode — button cluster and non-responders section

**Files:**
- Modify: `app/_components/Roster.tsx`
- Modify: `tests/unit/Roster.test.tsx`

`Roster.tsx` accepts an optional `admin` prop; when present, every row except the admin's own row gets three icon-circle buttons (✓ ? ✗). Non-responders render in a fourth section beneath Out.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/Roster.test.tsx`. Add to the existing imports at the top of the file:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
```

(Replace the existing `import { render, screen } from "@testing-library/react";` line.)

Then append these `describe` blocks after the existing `describe`:

```tsx
describe("Roster (admin mode)", () => {
  const adminId = "p-admin";
  const entries: RosterEntry[] = [
    { playerId: "p-alice", name: "Alice", status: "in", guests: 0, note: null },
    { playerId: adminId, name: "Admin Self", status: "in", guests: 0, note: null },
    { playerId: "p-bob", name: "Bob", status: "maybe", guests: 0, note: null },
  ];

  it("renders three buttons per row except for the admin's own row", () => {
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus: jest.fn() }}
      />
    );
    // Three sections, each row in In/Maybe — admin's own row should not have
    // buttons. Bob (maybe) and Alice (in) each get 3 buttons; admin gets 0.
    expect(screen.getAllByRole("button", { name: /set Alice/i })).toHaveLength(3);
    expect(screen.queryAllByRole("button", { name: /set Admin Self/i })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: /set Bob/i })).toHaveLength(3);
  });

  it("calls onSetStatus with the player's id and selected status when a button is clicked", async () => {
    const onSetStatus = jest.fn().mockResolvedValue(undefined);
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus }}
      />
    );
    const user = userEvent.setup();
    const outBtn = screen.getByRole("button", { name: /set Bob to out/i });
    await user.click(outBtn);
    expect(onSetStatus).toHaveBeenCalledWith("p-bob", "out");
  });

  it("disables the row's buttons while the request is in flight", async () => {
    let resolveFn: (() => void) | undefined;
    const onSetStatus = jest.fn(
      () => new Promise<void>((resolve) => { resolveFn = resolve; })
    );
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus }}
      />
    );
    const user = userEvent.setup();
    const outBtn = screen.getByRole("button", { name: /set Bob to out/i });
    await user.click(outBtn);
    expect(outBtn).toBeDisabled();
    resolveFn?.();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /set Bob to out/i })).not.toBeDisabled();
    });
  });

  it("shows an error message under the row when onSetStatus rejects", async () => {
    const onSetStatus = jest.fn().mockRejectedValue(new Error("boom"));
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus }}
      />
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /set Bob to out/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/failed/i);
    // buttons re-enabled after error
    expect(screen.getByRole("button", { name: /set Bob to out/i })).not.toBeDisabled();
  });

  it("renders a 'Not yet responded' section when nonResponders are passed", () => {
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus: jest.fn() }}
        nonResponders={[{ playerId: "p-cat", name: "Cat" }]}
      />
    );
    expect(screen.getByRole("heading", { name: /not yet responded/i })).toBeInTheDocument();
    expect(screen.getByText("Cat")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /set Cat/i })).toHaveLength(3);
  });

  it("does not render a non-responders section when the prop is empty or undefined", () => {
    render(
      <Roster
        entries={entries}
        admin={{ currentUserId: adminId, onSetStatus: jest.fn() }}
        nonResponders={[]}
      />
    );
    expect(screen.queryByRole("heading", { name: /not yet responded/i })).not.toBeInTheDocument();
  });

  it("renders no admin buttons when no admin prop is passed", () => {
    render(<Roster entries={entries} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
npm test -- Roster.test.tsx
```

Expected: the new "admin mode" tests fail (props not yet supported).

- [ ] **Step 3: Update `app/_components/Roster.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { RosterEntry, RsvpStatus } from "@/lib/scoreboard";

const ORDER: RosterEntry["status"][] = ["in", "maybe", "out"];
const LABEL: Record<RosterEntry["status"], string> = { in: "In", out: "Out", maybe: "Maybe" };
const HEADING_CLASS: Record<RosterEntry["status"], string> = {
  in: "text-emerald-700",
  maybe: "text-yellow-800",
  out: "text-red-700",
};

const STATUSES: RsvpStatus[] = ["in", "maybe", "out"];
const STATUS_GLYPH: Record<RsvpStatus, string> = { in: "✓", maybe: "?", out: "✗" };
const STATUS_LABEL: Record<RsvpStatus, string> = { in: "in", maybe: "maybe", out: "out" };
const STATUS_FILLED: Record<RsvpStatus, string> = {
  in: "bg-emerald-600 text-white",
  maybe: "bg-yellow-500 text-white",
  out: "bg-red-600 text-white",
};
const STATUS_OUTLINED: Record<RsvpStatus, string> = {
  in: "bg-white border border-emerald-400 text-emerald-700",
  maybe: "bg-white border border-yellow-400 text-yellow-800",
  out: "bg-white border border-red-400 text-red-700",
};

type AdminMode = {
  currentUserId: string;
  onSetStatus: (playerId: string, next: RsvpStatus) => Promise<void>;
};

function StatusCluster({
  playerName,
  current,
  disabled,
  onSelect,
}: {
  playerName: string;
  current: RsvpStatus | null;
  disabled: boolean;
  onSelect: (next: RsvpStatus) => void;
}) {
  return (
    <div className="shrink-0 flex gap-1.5" role="group" aria-label={`Set ${playerName}'s RSVP`}>
      {STATUSES.map((s) => {
        const filled = current === s;
        const cls = filled ? STATUS_FILLED[s] : STATUS_OUTLINED[s];
        return (
          <button
            key={s}
            type="button"
            aria-label={`Set ${playerName} to ${STATUS_LABEL[s]}`}
            aria-pressed={filled}
            disabled={disabled}
            onClick={() => onSelect(s)}
            className={`w-8 h-8 rounded-full text-sm font-bold grid place-items-center disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
          >
            {STATUS_GLYPH[s]}
          </button>
        );
      })}
    </div>
  );
}

function AdminRow({
  playerId,
  name,
  guests,
  note,
  current,
  showButtons,
  onSetStatus,
}: {
  playerId: string;
  name: string;
  guests: number;
  note: string | null;
  current: RsvpStatus | null;
  showButtons: boolean;
  onSetStatus?: (playerId: string, next: RsvpStatus) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(next: RsvpStatus) {
    if (!onSetStatus) return;
    setPending(true);
    setError(null);
    try {
      await onSetStatus(playerId, next);
    } catch {
      setError("Failed — please try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex items-start justify-between gap-3">
      <div className="flex flex-col">
        <span className="font-medium">
          {name}
          {guests > 0 && <span className="text-neutral-600"> +{guests}</span>}
        </span>
        {note && <span className="text-xs text-neutral-600 break-words">{note}</span>}
        {error && (
          <span role="alert" className="text-xs text-red-600">
            {error}
          </span>
        )}
      </div>
      {showButtons && onSetStatus && (
        <StatusCluster
          playerName={name}
          current={current}
          disabled={pending}
          onSelect={handle}
        />
      )}
    </li>
  );
}

export function Roster({
  entries,
  admin,
  nonResponders,
}: {
  entries: RosterEntry[];
  admin?: AdminMode;
  nonResponders?: { playerId: string; name: string }[];
}) {
  const hasGroups = entries.length > 0;
  const hasNonResponders = !!admin && !!nonResponders && nonResponders.length > 0;
  if (!hasGroups && !hasNonResponders) return null;

  const grouped: Record<RosterEntry["status"], RosterEntry[]> = { in: [], maybe: [], out: [] };
  for (const e of entries) grouped[e.status].push(e);

  return (
    <div className="flex flex-col gap-4 w-full">
      {ORDER.map((status) =>
        grouped[status].length === 0 ? null : (
          <section key={status} aria-labelledby={`roster-${status}`}>
            <h2
              id={`roster-${status}`}
              className={`text-sm font-semibold uppercase tracking-wide mb-2 ${HEADING_CLASS[status]}`}
            >
              {LABEL[status]}
            </h2>
            <ul className="flex flex-col gap-2 text-neutral-900">
              {grouped[status].map((e) => (
                <AdminRow
                  key={e.playerId}
                  playerId={e.playerId}
                  name={e.name}
                  guests={e.guests}
                  note={e.note}
                  current={e.status}
                  showButtons={!!admin && e.playerId !== admin.currentUserId}
                  onSetStatus={admin?.onSetStatus}
                />
              ))}
            </ul>
          </section>
        )
      )}

      {hasNonResponders && (
        <section aria-labelledby="roster-not-yet-responded">
          <h2
            id="roster-not-yet-responded"
            className="text-sm font-semibold uppercase tracking-wide mb-2 text-neutral-500"
          >
            Not yet responded
          </h2>
          <ul className="flex flex-col gap-2 text-neutral-900">
            {nonResponders!.map((n) => (
              <AdminRow
                key={n.playerId}
                playerId={n.playerId}
                name={n.name}
                guests={0}
                note={null}
                current={null}
                showButtons={true}
                onSetStatus={admin!.onSetStatus}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Re-run the tests**

```bash
npm test -- Roster.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean. The `Scoreboard.tsx` consumer of `<Roster />` does not yet pass `admin` or `nonResponders`; both are optional, so this still type-checks.

- [ ] **Step 6: Commit**

```bash
git add app/_components/Roster.tsx tests/unit/Roster.test.tsx
git commit -m "Add admin mode to Roster: per-row buttons and non-responders section"
```

---

## Task 7: Wire `Scoreboard` and `app/page.tsx` to the admin tool

**Files:**
- Modify: `app/_components/Scoreboard.tsx`
- Modify: `app/page.tsx`

`Scoreboard` accepts `isAdmin` and `currentUserId`, renders `<Roster admin={...} nonResponders={...}/>` when admin, owns the `onSetStatus` handler that POSTs to `/api/admin/rsvp` and triggers the existing `refresh()` to repaint. `page.tsx` calls `isCurrentUserAdmin` and threads the props down.

- [ ] **Step 1: Update `app/_components/Scoreboard.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScoreboardData, RsvpStatus } from "@/lib/scoreboard";
import { CountCards } from "./CountCards";
import { Roster } from "./Roster";
import { RsvpControls } from "./RsvpControls";
import { ConfirmationBanner } from "./ConfirmationBanner";

const POLL_MS = 30_000;

export function Scoreboard({
  initial,
  urlStatus = null,
  focusNoteOnMount = false,
  isAdmin = false,
  currentUserId = null,
}: {
  initial: ScoreboardData;
  urlStatus?: string | null;
  focusNoteOnMount?: boolean;
  isAdmin?: boolean;
  currentUserId?: string | null;
}) {
  const [data, setData] = useState<ScoreboardData>(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/scoreboard", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as ScoreboardData;
      setData(next);
    } catch {
      // ignore transient fetch errors
    }
  }, []);

  const setPlayerStatus = useCallback(
    async (playerId: string, next: RsvpStatus) => {
      const res = await fetch("/api/admin/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId, status: next }),
      });
      if (!res.ok) {
        // Throw so the row's AdminRow shows its inline error message.
        throw new Error(`admin rsvp failed: ${res.status}`);
      }
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    function tickIfVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    const id = setInterval(tickIfVisible, POLL_MS);
    document.addEventListener("visibilitychange", tickIfVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tickIfVisible);
    };
  }, [refresh]);

  if (data.state === "no-game") {
    return (
      <div className="text-center text-neutral-600">
        <p className="text-lg">No game today.</p>
      </div>
    );
  }

  if (data.state === "cancelled") {
    return (
      <div className="text-center">
        <p className="text-lg text-red-700 font-semibold">Game cancelled</p>
        {data.reason && <p className="text-sm text-neutral-600 mt-1">{data.reason}</p>}
      </div>
    );
  }

  const isMember = data.roster !== null;
  const adminProps =
    isAdmin && currentUserId
      ? { currentUserId, onSetStatus: setPlayerStatus }
      : undefined;
  const nonRespondersProps = isAdmin ? data.nonResponders ?? undefined : undefined;
  const rosterIsNonEmpty = !!data.roster && data.roster.length > 0;
  const renderRoster =
    rosterIsNonEmpty || (!!nonRespondersProps && nonRespondersProps.length > 0);

  return (
    <div className="flex flex-col w-full gap-6" aria-live="polite" aria-atomic="false">
      {isMember && (
        <ConfirmationBanner
          urlStatus={urlStatus}
          actualStatus={(data.currentUserRsvp?.status as RsvpStatus) ?? null}
        />
      )}
      {isMember ? (
        <div className="flex flex-col gap-6">
          <RsvpControls
            counts={data.counts}
            current={data.currentUserRsvp}
            focusNoteOnMount={focusNoteOnMount}
            onUpdated={refresh}
          />
          {renderRoster && (
            <Roster
              entries={data.roster ?? []}
              admin={adminProps}
              nonResponders={nonRespondersProps}
            />
          )}
        </div>
      ) : (
        <CountCards counts={data.counts} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `app/page.tsx`**

Two edits.

(a) Add the `isCurrentUserAdmin` import near the other lib imports:

```ts
import { isCurrentUserAdmin } from "@/lib/auth/admin";
```

(b) Inside `Home`, after the existing `getTodayScoreboard` call, compute `isAdmin` and pass it (along with `currentUserId`) to `<Scoreboard />`. Replace the existing block:

```tsx
  const today = getToday();
  const initial = await getTodayScoreboard(supabase, {
    today,
    includeRoster: !!user,
    userId: user?.id,
  });
```

with:

```tsx
  const today = getToday();
  const isAdmin = user ? await isCurrentUserAdmin(supabase) : false;
  const initial = await getTodayScoreboard(supabase, {
    today,
    includeRoster: !!user,
    includeNonResponders: isAdmin,
    userId: user?.id,
  });
```

And update the `<Scoreboard ... />` JSX to pass the two new props:

```tsx
        <Scoreboard
          initial={initial}
          urlStatus={urlStatus ?? null}
          focusNoteOnMount={!!urlStatus}
          isAdmin={isAdmin}
          currentUserId={user?.id ?? null}
        />
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Run the existing component tests to ensure no regressions**

```bash
npm test -- Scoreboard.test.tsx
npm test -- Roster.test.tsx
```

Expected: all PASS. (`Scoreboard.test.tsx` doesn't pass the new optional props, which default to `false`/`null`, so prior behavior is preserved.)

- [ ] **Step 5: Run the full unit test suite as a final sanity check**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 6: Manual verification**

Start the dev server:

```bash
npm run dev
```

In a browser at `http://devbox:3000`:

1. **As an admin** (a player whose `is_admin = true`): home page shows the existing roster groups + a "Not yet responded" section. Each player row (except the admin's own) has three small circle buttons (✓ ? ✗). Click ✓ on a non-responder. After ~1s, that player should appear in the "In" group and disappear from "Not yet responded". The "In" count card should update.
2. **As a non-admin** (a player whose `is_admin = false`): home page is identical to before — no extra section, no per-row buttons. Counts and roster behave as today.
3. **As a logged-out visitor:** still sees only the count cards (no roster).
4. **On a no-game or cancelled day:** the "no game" or "cancelled" copy renders for everyone, including admins. (Admin tool is hidden by virtue of the existing scoreboard state machine.)

If any of the above fail, do not commit — debug, fix, and re-verify.

- [ ] **Step 7: Commit**

```bash
git add app/_components/Scoreboard.tsx app/page.tsx
git commit -m "Wire admin roster controls into Scoreboard and home page"
```

---

## Wrap-up

- [ ] **Final check: full test suite + type check**

```bash
npx tsc --noEmit
npm test
```

Expected: clean type check, all tests pass.

- [ ] **Push the branch and open a PR for review.**

```bash
git push -u origin feature/admin-roster-rsvp
gh pr create --title "Admin roster: see non-responders + set in/maybe/out per player" \
  --body "Implements docs/superpowers/specs/2026-04-24-admin-roster-rsvp-design.md and bundles the prerequisite is_admin write-protection trigger."
```

Manual verifications to repeat in the deployed preview before merging:
1. Admin sees "Not yet responded" + per-row buttons; non-admin does not.
2. Clicking a button on a non-responder moves them into the correct group and updates count cards on refresh.
3. Existing self-RSVP flow (count cards, guests, note) still works for everyone.
4. From the Supabase Studio SQL editor on the preview project: `UPDATE public.players SET is_admin = true WHERE id = '<test-uuid>'` succeeds (bootstrap path preserved).
5. From a logged-in user's browser console: `await fetch('https://<preview>/rest/v1/players?id=eq.<self>', { method: 'PATCH', headers: {...}, body: JSON.stringify({is_admin: true}) })` returns an error containing "is_admin" (trigger blocks the write).
