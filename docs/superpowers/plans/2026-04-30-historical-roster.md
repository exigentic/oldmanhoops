# Historical Roster View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/d/[date]` page that renders the same scoreboard as the home page for any game date — anon viewers see counts, members see the roster, members can RSVP for today/future, admins can edit RSVPs on any date.

**Architecture:** Thread a `date` parameter through the existing scoreboard library, the three RSVP-related API routes, and the `Scoreboard`/`RsvpControls` client components. Add a new page at `app/d/[date]/page.tsx` that mirrors `app/page.tsx`. A single `isLive` boolean (`isAdmin OR date >= today`) gates write controls.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, Luxon, Jest, Playwright.

---

## File Structure

**Create:**
- `app/d/[date]/page.tsx` — historical scoreboard route
- `tests/e2e/historical-roster.spec.ts` — end-to-end test

**Modify:**
- `lib/date.ts` — add `isValidGameDate`
- `lib/scoreboard.ts` — rename `getTodayScoreboard` → `getScoreboard`, rename `today` opt → `date`
- `app/api/scoreboard/route.ts` — accept `?date=`
- `app/api/rsvp/route.ts` — require `game_date` in body, enforce member past-date 403
- `app/api/admin/rsvp/route.ts` — require `game_date` in body
- `app/_components/Scoreboard.tsx` — add `viewDate`/`isLive` props, suppress live behavior when `!isLive`, date-aware no-game/cancelled copy
- `app/_components/RsvpControls.tsx` — accept `viewDate`, send in POST body
- `app/page.tsx` — pass `viewDate={getToday()}` and `isLive={true}`
- `tests/unit/scoreboard.test.ts` — update to new function/option names, add past-date case
- `tests/unit/date.test.ts` — add `isValidGameDate` cases
- `tests/unit/api-admin-rsvp.test.ts` — update to new `game_date` body field

**Will be created during plan:**
- `tests/unit/api-rsvp.test.ts` — covers `/api/rsvp` POST date enforcement (no current test for this route)
- `tests/unit/api-scoreboard.test.ts` — covers `/api/scoreboard` route handler

---

## Task 1: Add `isValidGameDate` helper

**Files:**
- Modify: `lib/date.ts`
- Test: `tests/unit/date.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/date.test.ts`:

```ts
import { isValidGameDate } from "@/lib/date";

describe("isValidGameDate", () => {
  it("accepts a valid YYYY-MM-DD", () => {
    expect(isValidGameDate("2026-04-30")).toBe(true);
  });

  it("rejects malformed strings", () => {
    expect(isValidGameDate("foo")).toBe(false);
    expect(isValidGameDate("")).toBe(false);
    expect(isValidGameDate("2026-4-30")).toBe(false);
  });

  it("rejects out-of-range months/days", () => {
    expect(isValidGameDate("2026-13-01")).toBe(false);
    expect(isValidGameDate("2026-02-30")).toBe(false);
    expect(isValidGameDate("2026-00-15")).toBe(false);
  });

  it("rejects extra characters", () => {
    expect(isValidGameDate("2026-04-30T00:00:00")).toBe(false);
  });
});
```

The first import update is also needed at the top of the file:

```ts
import { getToday, isGameDay, getLocalHour, isValidGameDate } from "@/lib/date";
```

(Replace the existing `import { getToday, isGameDay, getLocalHour } from "@/lib/date";` line.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/date.test.ts -t isValidGameDate`
Expected: FAIL with "isValidGameDate is not a function" or "is not exported".

- [ ] **Step 3: Implement `isValidGameDate`**

Append to `lib/date.ts`:

```ts
export function isValidGameDate(dateStr: string, zone: string = env.APP_TIMEZONE): boolean {
  if (typeof dateStr !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const dt = DateTime.fromFormat(dateStr, "yyyy-MM-dd", { zone });
  return dt.isValid && dt.toFormat("yyyy-MM-dd") === dateStr;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/date.test.ts`
Expected: PASS (all date tests including the new ones).

- [ ] **Step 5: Commit**

```bash
git add lib/date.ts tests/unit/date.test.ts
git commit -m "Add isValidGameDate helper"
```

---

## Task 2: Rename `getTodayScoreboard` → `getScoreboard`, `today` opt → `date`

This is a mechanical rename. The function body doesn't change — it already queries `eq("game_date", opts.today)`, which becomes `eq("game_date", opts.date)`.

**Files:**
- Modify: `lib/scoreboard.ts`
- Modify: `tests/unit/scoreboard.test.ts`
- Modify: `app/page.tsx`
- Modify: `app/api/scoreboard/route.ts`

- [ ] **Step 1: Update `lib/scoreboard.ts`**

In `lib/scoreboard.ts`, change line 44:

```ts
// Before:
export async function getTodayScoreboard(
  supabase: SupabaseClient,
  opts: {
    today: string;
    includeRoster: boolean;
    includeNonResponders?: boolean;
    userId?: string;
  }
): Promise<ScoreboardData> {

// After:
export async function getScoreboard(
  supabase: SupabaseClient,
  opts: {
    date: string;
    includeRoster: boolean;
    includeNonResponders?: boolean;
    userId?: string;
  }
): Promise<ScoreboardData> {
```

Then change line 56:

```ts
// Before:
    .eq("game_date", opts.today)
// After:
    .eq("game_date", opts.date)
```

- [ ] **Step 2: Update `tests/unit/scoreboard.test.ts`**

Replace `getTodayScoreboard` with `getScoreboard` everywhere (15 callsites). Replace each `today: date` with `date` in the option objects.

In the import:

```ts
// Before:
import { getTodayScoreboard } from "@/lib/scoreboard";
// After:
import { getScoreboard } from "@/lib/scoreboard";
```

In the describe block:

```ts
// Before:
describe("getTodayScoreboard", () => {
// After:
describe("getScoreboard", () => {
```

In every call site, e.g.:

```ts
// Before:
const result = await getTodayScoreboard(admin, { today: date, includeRoster: false });
// After:
const result = await getScoreboard(admin, { date, includeRoster: false });
```

(Apply this transformation to every call in the file.)

- [ ] **Step 3: Update `app/page.tsx`**

```ts
// Before:
import { getTodayScoreboard } from "@/lib/scoreboard";
// After:
import { getScoreboard } from "@/lib/scoreboard";
```

```ts
// Before:
const initial = await getTodayScoreboard(supabase, {
  today,
  includeRoster: !!user,
  includeNonResponders: isAdmin,
  userId: user?.id,
});
// After:
const initial = await getScoreboard(supabase, {
  date: today,
  includeRoster: !!user,
  includeNonResponders: isAdmin,
  userId: user?.id,
});
```

- [ ] **Step 4: Update `app/api/scoreboard/route.ts`**

```ts
// Before:
import { getTodayScoreboard } from "@/lib/scoreboard";
// After:
import { getScoreboard } from "@/lib/scoreboard";
```

```ts
// Before:
const data = await getTodayScoreboard(supabase, {
  today: getToday(),
  includeRoster: !!user,
  includeNonResponders: isAdmin,
  userId: user?.id,
});
// After:
const data = await getScoreboard(supabase, {
  date: getToday(),
  includeRoster: !!user,
  includeNonResponders: isAdmin,
  userId: user?.id,
});
```

- [ ] **Step 5: Run tests to verify the rename works**

Run: `npx jest tests/unit/scoreboard.test.ts`
Expected: PASS — all 12+ tests still pass.

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/scoreboard.ts tests/unit/scoreboard.test.ts app/page.tsx app/api/scoreboard/route.ts
git commit -m "Rename getTodayScoreboard to getScoreboard"
```

---

## Task 3: `/api/scoreboard` accepts `?date=`

**Files:**
- Modify: `app/api/scoreboard/route.ts`
- Create: `tests/unit/api-scoreboard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/api-scoreboard.test.ts`:

```ts
/** @jest-environment node */
const getUserMock = jest.fn();
const isCurrentUserAdminMock = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

jest.mock("@/lib/auth/admin", () => ({
  isCurrentUserAdmin: (...args: unknown[]) => isCurrentUserAdminMock(...args),
}));

import { GET } from "@/app/api/scoreboard/route";

beforeEach(() => {
  getUserMock.mockReset();
  isCurrentUserAdminMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: null }, error: null });
  isCurrentUserAdminMock.mockResolvedValue(false);
});

describe("GET /api/scoreboard", () => {
  it("returns 200 with no-game when no date param is provided (defaults to today)", async () => {
    const res = await GET(new Request("http://localhost/api/scoreboard"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("no-game");
  });

  it("returns 200 with no-game when a valid date is provided", async () => {
    const res = await GET(new Request("http://localhost/api/scoreboard?date=2099-01-15"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("no-game");
  });

  it("returns 400 when date is malformed", async () => {
    const res = await GET(new Request("http://localhost/api/scoreboard?date=not-a-date"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when date is an invalid calendar date", async () => {
    const res = await GET(new Request("http://localhost/api/scoreboard?date=2026-13-01"));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/api-scoreboard.test.ts`
Expected: FAIL — likely "GET takes no arguments" because the current handler signature is `export async function GET()` and doesn't read query params.

- [ ] **Step 3: Update the handler**

Replace `app/api/scoreboard/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getToday, isValidGameDate } from "@/lib/date";
import { getScoreboard } from "@/lib/scoreboard";
import { isCurrentUserAdmin } from "@/lib/auth/admin";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const date = dateParam ?? getToday();
  if (dateParam !== null && !isValidGameDate(dateParam)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdmin = user ? await isCurrentUserAdmin(supabase) : false;

  const data = await getScoreboard(supabase, {
    date,
    includeRoster: !!user,
    includeNonResponders: isAdmin,
    userId: user?.id,
  });

  return NextResponse.json(data);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/api-scoreboard.test.ts`
Expected: PASS — all four cases pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/scoreboard/route.ts tests/unit/api-scoreboard.test.ts
git commit -m "Allow /api/scoreboard to accept ?date= param"
```

---

## Task 4: `/api/admin/rsvp` accepts `game_date` in body

**Files:**
- Modify: `app/api/admin/rsvp/route.ts`
- Modify: `tests/unit/api-admin-rsvp.test.ts`

- [ ] **Step 1: Update the existing tests to send `game_date` in every successful POST body**

In `tests/unit/api-admin-rsvp.test.ts`:

Change every test that currently posts a body without `game_date` to include `game_date: getToday()` (or whatever date that test seeded). Specifically:

- "returns 401" — leave as-is (the body never reaches the date check).
- "returns 403 when the caller is not an admin" — leave as-is.
- "returns 400 for invalid status" — leave as-is.
- "returns 400 for non-uuid player_id" — leave as-is.
- "returns 400 for invalid JSON body" — leave as-is.
- "returns 404 when no game exists today" — change to `makeRequest({ player_id: "00000000-0000-0000-0000-000000000000", status: "in", game_date: today })`.
- "returns 403 when today's game is cancelled" — same: add `game_date: today`.
- "inserts a new RSVP..." — same: add `game_date: today`.
- "preserves guests and note when updating..." — same: add `game_date: today`.

Add four new test cases at the end of the describe block:

```ts
it("returns 400 when game_date is missing", async () => {
  mockSession("user-1");
  mockIsAdmin(true);
  const res = await POST(makeRequest({ player_id: "00000000-0000-0000-0000-000000000000", status: "in" }));
  expect(res.status).toBe(400);
});

it("returns 400 when game_date is malformed", async () => {
  mockSession("user-1");
  mockIsAdmin(true);
  const res = await POST(
    makeRequest({ player_id: "00000000-0000-0000-0000-000000000000", status: "in", game_date: "not-a-date" })
  );
  expect(res.status).toBe(400);
});

it("admin can update RSVP on a past date", async () => {
  mockSession("user-1");
  mockIsAdmin(true);
  // Past date relative to today.
  const past = "2099-12-30"; // far enough in the future for the game seed; mirrors existing tests' fake "today"
  // For an actual "past relative to today" test we use a seeded date: this test exercises the "non-today" code path.
  const gameId = await seedGame(past);
  const target = await seedPlayer(`admin-rsvp-pastdate-${Date.now()}@example.com`);
  try {
    const res = await POST(makeRequest({ player_id: target, status: "in", game_date: past }));
    expect(res.status).toBe(200);
    const row = await pool.query(
      `SELECT status FROM rsvps WHERE player_id = $1 AND game_id = $2`,
      [target, gameId]
    );
    expect(row.rows[0]).toMatchObject({ status: "in" });
  } finally {
    await pool.query(`DELETE FROM rsvps WHERE player_id = $1`, [target]);
    await pool.query(`DELETE FROM games WHERE game_date = $1`, [past]);
    await admin.auth.admin.deleteUser(target);
  }
});

it("returns 404 when no game exists for the given date", async () => {
  mockSession("user-1");
  mockIsAdmin(true);
  const date = "2099-12-31";
  await pool.query(`DELETE FROM rsvps WHERE game_id IN (SELECT id FROM games WHERE game_date = $1)`, [date]);
  await pool.query(`DELETE FROM games WHERE game_date = $1`, [date]);
  const res = await POST(
    makeRequest({ player_id: "00000000-0000-0000-0000-000000000000", status: "in", game_date: date })
  );
  expect(res.status).toBe(404);
});
```

(Note: the "past date" test name is informational — the route allows admin edits on any date, so the test only verifies that a non-today date is accepted.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/api-admin-rsvp.test.ts`
Expected: FAIL — the new tests fail because the route doesn't read `game_date` yet, the existing tests still pass because the route still uses `getToday()`.

- [ ] **Step 3: Update the route**

Replace `app/api/admin/rsvp/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/auth/admin";
import { isValidGameDate } from "@/lib/date";

const VALID_STATUSES = new Set(["in", "out", "maybe"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PostBody {
  player_id?: string;
  status?: string;
  game_date?: string;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
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
  const { player_id, status, game_date } = body;
  if (!player_id || typeof player_id !== "string" || !UUID_RE.test(player_id)) {
    return NextResponse.json({ error: "player_id must be a uuid" }, { status: 400 });
  }
  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "status must be in|out|maybe" }, { status: 400 });
  }
  if (!game_date || typeof game_date !== "string" || !isValidGameDate(game_date)) {
    return NextResponse.json({ error: "game_date must be YYYY-MM-DD" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: game, error: gameErr } = await adminClient
    .from("games")
    .select("id, status")
    .eq("game_date", game_date)
    .maybeSingle();
  if (gameErr) {
    return NextResponse.json({ error: gameErr.message }, { status: 500 });
  }
  if (!game) {
    return NextResponse.json({ error: "No game on that date" }, { status: 404 });
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/api-admin-rsvp.test.ts`
Expected: PASS — all original tests + four new ones.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/rsvp/route.ts tests/unit/api-admin-rsvp.test.ts
git commit -m "Require game_date in /api/admin/rsvp body"
```

---

## Task 5: `/api/rsvp` accepts `game_date`, blocks past-date member writes

**Files:**
- Modify: `app/api/rsvp/route.ts`
- Create: `tests/unit/api-rsvp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/api-rsvp.test.ts`:

```ts
/** @jest-environment node */
const getUserMock = jest.fn();
const isCurrentUserAdminMock = jest.fn();

jest.mock("@/lib/supabase/server", () => {
  const actual = jest.requireActual("@/lib/supabase/server");
  return {
    ...actual,
    createClient: async () => {
      // Build a Supabase admin client and override `auth.getUser` so we can
      // mock the session, while still routing real DB queries to Supabase.
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const realAdmin = createAdminClient();
      return {
        ...realAdmin,
        auth: { ...realAdmin.auth, getUser: getUserMock },
      };
    },
  };
});

jest.mock("@/lib/auth/admin", () => ({
  isCurrentUserAdmin: (...args: unknown[]) => isCurrentUserAdminMock(...args),
}));

import { Pool } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "@/app/api/rsvp/route";
import { getToday } from "@/lib/date";

const CONN =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

let pool: Pool;
let admin: ReturnType<typeof createAdminClient>;

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/rsvp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSession(userId: string | null) {
  getUserMock.mockResolvedValueOnce({
    data: { user: userId ? { id: userId } : null },
    error: null,
  });
}

async function seedPlayer(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: "P" },
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

beforeEach(() => {
  getUserMock.mockReset();
  isCurrentUserAdminMock.mockReset();
});

describe("POST /api/rsvp", () => {
  it("returns 401 when no session is present", async () => {
    mockSession(null);
    const res = await POST(makeRequest({ status: "in", game_date: getToday() }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when game_date is missing", async () => {
    mockSession("user-1");
    isCurrentUserAdminMock.mockResolvedValueOnce(false);
    const res = await POST(makeRequest({ status: "in" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when game_date is malformed", async () => {
    mockSession("user-1");
    isCurrentUserAdminMock.mockResolvedValueOnce(false);
    const res = await POST(makeRequest({ status: "in", game_date: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("returns 403 when non-admin posts a past game_date", async () => {
    const target = await seedPlayer(`rsvp-past-${Date.now()}@example.com`);
    mockSession(target);
    isCurrentUserAdminMock.mockResolvedValueOnce(false);
    try {
      const res = await POST(makeRequest({ status: "in", game_date: "2000-01-03" }));
      expect(res.status).toBe(403);
    } finally {
      await admin.auth.admin.deleteUser(target);
    }
  });

  it("admin can RSVP for a past date through /api/rsvp (defense-in-depth bypass)", async () => {
    const date = "2099-01-15";
    const gameId = await seedGame(date);
    const target = await seedPlayer(`rsvp-admin-past-${Date.now()}@example.com`);
    mockSession(target);
    isCurrentUserAdminMock.mockResolvedValueOnce(true);
    try {
      const res = await POST(makeRequest({ status: "in", game_date: date }));
      expect(res.status).toBe(200);
      const row = await pool.query(
        `SELECT status FROM rsvps WHERE player_id = $1 AND game_id = $2`,
        [target, gameId]
      );
      expect(row.rows[0]).toMatchObject({ status: "in" });
    } finally {
      await pool.query(`DELETE FROM rsvps WHERE player_id = $1`, [target]);
      await pool.query(`DELETE FROM games WHERE game_date = $1`, [date]);
      await admin.auth.admin.deleteUser(target);
    }
  });

  it("member can RSVP for today's game", async () => {
    const today = getToday();
    const gameId = await seedGame(today);
    const target = await seedPlayer(`rsvp-today-${Date.now()}@example.com`);
    mockSession(target);
    isCurrentUserAdminMock.mockResolvedValueOnce(false);
    try {
      const res = await POST(makeRequest({ status: "in", game_date: today }));
      expect(res.status).toBe(200);
      const row = await pool.query(
        `SELECT status FROM rsvps WHERE player_id = $1 AND game_id = $2`,
        [target, gameId]
      );
      expect(row.rows[0]).toMatchObject({ status: "in" });
    } finally {
      await pool.query(`DELETE FROM rsvps WHERE player_id = $1`, [target]);
      await pool.query(`DELETE FROM games WHERE game_date = $1`, [today]);
      await admin.auth.admin.deleteUser(target);
    }
  });

  it("member can RSVP for a future game", async () => {
    const future = "2099-06-01";
    const gameId = await seedGame(future);
    const target = await seedPlayer(`rsvp-future-${Date.now()}@example.com`);
    mockSession(target);
    isCurrentUserAdminMock.mockResolvedValueOnce(false);
    try {
      const res = await POST(makeRequest({ status: "in", game_date: future }));
      expect(res.status).toBe(200);
      const row = await pool.query(
        `SELECT status FROM rsvps WHERE player_id = $1 AND game_id = $2`,
        [target, gameId]
      );
      expect(row.rows[0]).toMatchObject({ status: "in" });
    } finally {
      await pool.query(`DELETE FROM rsvps WHERE player_id = $1`, [target]);
      await pool.query(`DELETE FROM games WHERE game_date = $1`, [future]);
      await admin.auth.admin.deleteUser(target);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/api-rsvp.test.ts`
Expected: FAIL — `game_date` is not validated yet, past-date 403 doesn't exist yet.

- [ ] **Step 3: Update the route**

Replace `app/api/rsvp/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday, isValidGameDate } from "@/lib/date";
import { verifyToken } from "@/lib/hmac";
import { env } from "@/lib/env";
import { isCurrentUserAdmin } from "@/lib/auth/admin";

const VALID_STATUSES = new Set(["in", "out", "maybe"]);

interface PostBody {
  status?: string;
  guests?: number;
  note?: string | null;
  game_date?: string;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  const { status, guests = 0, note = null, game_date } = body;
  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "status must be in|out|maybe" }, { status: 400 });
  }
  if (!Number.isInteger(guests) || guests < 0 || guests > 10) {
    return NextResponse.json({ error: "guests must be integer 0..10" }, { status: 400 });
  }
  if (note !== null && (typeof note !== "string" || note.length > 100)) {
    return NextResponse.json(
      { error: "note must be a string <= 100 chars or null" },
      { status: 400 }
    );
  }
  if (!game_date || typeof game_date !== "string" || !isValidGameDate(game_date)) {
    return NextResponse.json({ error: "game_date must be YYYY-MM-DD" }, { status: 400 });
  }

  if (game_date < getToday()) {
    const adminCheck = await isCurrentUserAdmin(supabase);
    if (!adminCheck) {
      return NextResponse.json({ error: "Cannot edit RSVP on a past date" }, { status: 403 });
    }
  }

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, status")
    .eq("game_date", game_date)
    .maybeSingle();
  if (gameErr) {
    return NextResponse.json({ error: gameErr.message }, { status: 500 });
  }
  if (!game) {
    return NextResponse.json({ error: "No game on that date" }, { status: 404 });
  }
  if (game.status === "cancelled") {
    return NextResponse.json({ error: "Game cancelled" }, { status: 403 });
  }

  const { error: upsertErr } = await supabase
    .from("rsvps")
    .upsert(
      { game_id: game.id, player_id: user.id, status, guests, note },
      { onConflict: "game_id,player_id" }
    );
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const status = url.searchParams.get("status");
  const playerId = url.searchParams.get("player_id");
  const gameId = url.searchParams.get("game_id");

  if (!token || !status || !playerId || !gameId) {
    return NextResponse.redirect(`${url.origin}/login?error=missing-params`);
  }

  const result = verifyToken(token, env.HMAC_SECRET);
  if (!result.ok) {
    return NextResponse.redirect(`${url.origin}/login?error=invalid-token`);
  }
  const p = result.payload;
  if (p.player_id !== playerId || p.game_id !== gameId || p.status !== status) {
    return NextResponse.redirect(`${url.origin}/login?error=token-mismatch`);
  }

  const admin = createAdminClient();

  const { data: game, error: gameErr } = await admin
    .from("games")
    .select("id, status")
    .eq("id", p.game_id)
    .maybeSingle();
  if (gameErr || !game) {
    return NextResponse.redirect(`${url.origin}/?cancelled=1`);
  }
  if (game.status === "cancelled") {
    return NextResponse.redirect(`${url.origin}/?cancelled=1`);
  }

  const { error: upsertErr } = await admin
    .from("rsvps")
    .upsert(
      { game_id: p.game_id, player_id: p.player_id, status: p.status },
      { onConflict: "game_id,player_id" }
    );
  if (upsertErr) {
    return NextResponse.redirect(`${url.origin}/login?error=rsvp-failed`);
  }

  const { data: userResult, error: userErr } = await admin.auth.admin.getUserById(p.player_id);
  if (userErr || !userResult.user?.email) {
    return NextResponse.redirect(`${url.origin}/login?error=user-lookup-failed`);
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userResult.user.email,
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    return NextResponse.redirect(`${url.origin}/login?error=link-generation-failed`);
  }

  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyErr) {
    return NextResponse.redirect(`${url.origin}/login?error=session-failed`);
  }

  return NextResponse.redirect(`${url.origin}/?status=${p.status}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/api-rsvp.test.ts`
Expected: PASS — all 7 cases.

Also check existing E2E:

Run: `npx jest tests/unit/api-auth-email.test.ts`
Expected: PASS (unchanged GET path).

- [ ] **Step 5: Commit**

```bash
git add app/api/rsvp/route.ts tests/unit/api-rsvp.test.ts
git commit -m "Require game_date in /api/rsvp body and block past-date member writes"
```

---

## Task 6: Thread `viewDate` through `RsvpControls`

**Files:**
- Modify: `app/_components/RsvpControls.tsx`

- [ ] **Step 1: Add the prop**

Update the `RsvpControls` props in `app/_components/RsvpControls.tsx`:

```tsx
// Before:
export function RsvpControls({
  counts,
  current,
  focusNoteOnMount = false,
  onUpdated,
}: {
  counts: { in: number; out: number; maybe: number };
  current: CurrentRsvp | null;
  focusNoteOnMount?: boolean;
  onUpdated?: () => void;
}) {

// After:
export function RsvpControls({
  counts,
  current,
  viewDate,
  focusNoteOnMount = false,
  onUpdated,
}: {
  counts: { in: number; out: number; maybe: number };
  current: CurrentRsvp | null;
  viewDate: string;
  focusNoteOnMount?: boolean;
  onUpdated?: () => void;
}) {
```

- [ ] **Step 2: Include `game_date` in the POST body**

In the `submit` function inside `RsvpControls.tsx`:

```tsx
// Before:
const body = {
  status: next.status ?? status,
  guests: next.guests ?? guests,
  note: (next.note ?? note) || null,
};

// After:
const body = {
  status: next.status ?? status,
  guests: next.guests ?? guests,
  note: (next.note ?? note) || null,
  game_date: viewDate,
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: a single error in `app/_components/Scoreboard.tsx` because it doesn't pass `viewDate`. We'll fix that in Task 7.

- [ ] **Step 4: Skip commit**

Don't commit yet — Task 7 wraps up the client wiring, and we want one cohesive commit for the client change.

---

## Task 7: Add `viewDate` and `isLive` props to `Scoreboard`

**Files:**
- Modify: `app/_components/Scoreboard.tsx`

- [ ] **Step 1: Update props and behavior**

Replace the entire body of `app/_components/Scoreboard.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScoreboardData, RsvpStatus } from "@/lib/scoreboard";
import { formatGameDate } from "@/lib/date";
import { CountCards } from "./CountCards";
import { Roster } from "./Roster";
import { RsvpControls } from "./RsvpControls";
import { ConfirmationBanner } from "./ConfirmationBanner";

const POLL_MS = 30_000;

export function Scoreboard({
  initial,
  viewDate,
  isLive,
  urlStatus = null,
  focusNoteOnMount = false,
  isAdmin = false,
  currentUserId = null,
}: {
  initial: ScoreboardData;
  viewDate: string;
  isLive: boolean;
  urlStatus?: string | null;
  focusNoteOnMount?: boolean;
  isAdmin?: boolean;
  currentUserId?: string | null;
}) {
  const [data, setData] = useState<ScoreboardData>(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/scoreboard?date=${viewDate}`, { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as ScoreboardData;
      setData(next);
    } catch {
      // ignore transient fetch errors
    }
  }, [viewDate]);

  const setPlayerStatus = useCallback(
    async (playerId: string, next: RsvpStatus) => {
      const res = await fetch("/api/admin/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId, status: next, game_date: viewDate }),
      });
      if (!res.ok) {
        throw new Error(`admin rsvp failed: ${res.status}`);
      }
      await refresh();
    },
    [refresh, viewDate]
  );

  useEffect(() => {
    if (!isLive) return;
    function tickIfVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    const id = setInterval(tickIfVisible, POLL_MS);
    document.addEventListener("visibilitychange", tickIfVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tickIfVisible);
    };
  }, [refresh, isLive]);

  if (data.state === "no-game") {
    return (
      <div className="text-center text-neutral-600">
        <p className="text-lg">No game on {formatGameDate(viewDate)}.</p>
      </div>
    );
  }

  if (data.state === "cancelled") {
    return (
      <div className="text-center">
        <p className="text-lg text-red-700 font-semibold">
          Game cancelled — {formatGameDate(viewDate)}
        </p>
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
      {isMember && isLive && (
        <ConfirmationBanner
          urlStatus={urlStatus}
          actualStatus={(data.currentUserRsvp?.status as RsvpStatus) ?? null}
        />
      )}
      {isMember ? (
        <div className="flex flex-col gap-6">
          {isLive ? (
            <RsvpControls
              counts={data.counts}
              current={data.currentUserRsvp}
              viewDate={viewDate}
              focusNoteOnMount={focusNoteOnMount}
              onUpdated={refresh}
            />
          ) : (
            <CountCards counts={data.counts} />
          )}
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

- [ ] **Step 2: Update `app/page.tsx` to pass the new props**

In `app/page.tsx`, change the `<Scoreboard>` JSX:

```tsx
// Before:
<Scoreboard
  initial={initial}
  urlStatus={urlStatus ?? null}
  focusNoteOnMount={!!urlStatus}
  isAdmin={isAdmin}
  currentUserId={user?.id ?? null}
/>

// After:
<Scoreboard
  initial={initial}
  viewDate={today}
  isLive={true}
  urlStatus={urlStatus ?? null}
  focusNoteOnMount={!!urlStatus}
  isAdmin={isAdmin}
  currentUserId={user?.id ?? null}
/>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run existing E2E to verify the home page still works**

Run: `npm run test:e2e -- visitor.spec.ts rsvp-from-site.spec.ts`
Expected: PASS — anon flow and member RSVP flow both work.

- [ ] **Step 5: Commit**

```bash
git add app/_components/Scoreboard.tsx app/_components/RsvpControls.tsx app/page.tsx
git commit -m "Thread viewDate and isLive through Scoreboard and RsvpControls"
```

---

## Task 8: Add the `/d/[date]` page

**Files:**
- Create: `app/d/[date]/page.tsx`

- [ ] **Step 1: Write the page**

Create `app/d/[date]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { formatGameDate, getToday, isValidGameDate } from "@/lib/date";
import { getScoreboard } from "@/lib/scoreboard";
import { isCurrentUserAdmin } from "@/lib/auth/admin";
import { Scoreboard } from "@/app/_components/Scoreboard";
import { getSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const origin = getSiteOrigin();
  const base: Metadata = {
    title: "Old Man Hoops",
    description: "Daily pickup basketball RSVP",
  };
  if (!origin || !isValidGameDate(date)) return base;

  const ogUrl = `${origin}/og/${date}`;
  return {
    ...base,
    openGraph: {
      title: "Old Man Hoops",
      description: "Daily pickup basketball RSVP",
      images: [{ url: ogUrl, width: 1200, height: 630, alt: "Old Man Hoops — RSVP counts" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Old Man Hoops",
      description: "Daily pickup basketball RSVP",
      images: [ogUrl],
    },
  };
}

export default async function HistoricalScoreboard({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isValidGameDate(date)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = user ? await isCurrentUserAdmin(supabase) : false;
  const today = getToday();
  const isLive = isAdmin || date >= today;

  const initial = await getScoreboard(supabase, {
    date,
    includeRoster: !!user,
    includeNonResponders: isAdmin,
    userId: user?.id,
  });

  return (
    <main className="min-h-screen flex flex-col items-center bg-stone-300 text-neutral-900 p-6 pt-8 gap-6">
      <header className="flex items-center gap-4">
        <Image src="/omh.svg" alt="" width={56} height={56} />
        <div className="flex flex-col leading-tight">
          <h1 className="text-2xl font-bold text-indigo-700">Old Man Hoops</h1>
          <p className="text-sm text-neutral-600">M-F, Noon @ One Athletics</p>
          <p className="text-sm text-neutral-600 mt-0.5">{formatGameDate(date)}</p>
        </div>
      </header>

      <div className="w-full max-w-lg flex flex-col items-center gap-6">
        <Scoreboard
          initial={initial}
          viewDate={date}
          isLive={isLive}
          isAdmin={isAdmin}
          currentUserId={user?.id ?? null}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke-test in the dev server**

Run: `npm run dev` (in another terminal).

Open `http://devbox:3000/d/2099-01-15` — should show the page header with the formatted date "Thursday, January 15" and "No game on …" copy.

Open `http://devbox:3000/d/not-a-date` — should 404.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add app/d/[date]/page.tsx
git commit -m "Add /d/[date] historical scoreboard page"
```

---

## Task 9: E2E test for historical roster

**Files:**
- Create: `tests/e2e/historical-roster.spec.ts`

The test seeds a past game day and a few RSVPs, then verifies the three viewer modes (anon, member, admin).

- [ ] **Step 1: Write the test**

Create `tests/e2e/historical-roster.spec.ts`:

```ts
import { test, expect } from "./fixtures";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const PAST_DATE = "2025-01-15";

async function seedPastGame() {
  const admin = adminClient();
  await admin
    .from("games")
    .upsert({ game_date: PAST_DATE, status: "scheduled" }, { onConflict: "game_date" });
  const { data: gameRow } = await admin
    .from("games")
    .select("id")
    .eq("game_date", PAST_DATE)
    .maybeSingle();
  return gameRow!.id as string;
}

async function cleanupPastGame() {
  const admin = adminClient();
  const { data: gameRow } = await admin
    .from("games")
    .select("id")
    .eq("game_date", PAST_DATE)
    .maybeSingle();
  if (gameRow?.id) {
    await admin.from("rsvps").delete().eq("game_id", gameRow.id);
  }
  await admin.from("games").delete().eq("game_date", PAST_DATE);
}

test.beforeAll(async () => {
  await seedPastGame();
});

test.afterAll(async () => {
  await cleanupPastGame();
});

test("anon visitor sees count cards on a past date", async ({ page }) => {
  await page.goto(`/d/${PAST_DATE}`);
  await expect(page.getByLabel(/In count/i)).toBeVisible();
  await expect(page.getByLabel(/Maybe count/i)).toBeVisible();
  await expect(page.getByLabel(/Out count/i)).toBeVisible();
  // Roster only renders for logged-in members.
  await expect(page.getByRole("heading", { name: /^In$/, level: 2 })).toHaveCount(0);
});

test("member sees roster but no RSVP controls on a past date", async ({ page, authedUser }) => {
  // Seed an RSVP for the authed user so the roster has a row.
  const admin = adminClient();
  const { data: gameRow } = await admin
    .from("games")
    .select("id")
    .eq("game_date", PAST_DATE)
    .maybeSingle();
  await admin.from("rsvps").upsert(
    { game_id: gameRow!.id, player_id: authedUser.userId, status: "in", guests: 0, note: null },
    { onConflict: "game_id,player_id" }
  );

  await page.goto(`/d/${PAST_DATE}`);

  // The member-side roster heading should be visible.
  await expect(page.getByRole("heading", { name: /^In$/, level: 2 })).toBeVisible();

  // The "Your RSVP status" group is the marker for live RSVP controls — must be absent.
  await expect(page.getByRole("group", { name: /Your RSVP status/i })).toHaveCount(0);
});

test("admin can edit RSVP on a past date", async ({ page, authedUser }) => {
  const admin = adminClient();
  // Promote the authed user to admin so the per-row buttons render.
  await admin.from("players").update({ is_admin: true }).eq("id", authedUser.userId);

  // Seed a different player with an existing "in" RSVP so we have a row to click.
  const targetEmail = `e2e-target-${Date.now()}@example.com`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: targetEmail,
    email_confirm: true,
    user_metadata: { name: "Target Player" },
  });
  if (createErr) throw createErr;
  const targetId = created.user!.id;

  const { data: gameRow } = await admin
    .from("games")
    .select("id")
    .eq("game_date", PAST_DATE)
    .maybeSingle();
  await admin.from("rsvps").upsert(
    { game_id: gameRow!.id, player_id: targetId, status: "in", guests: 0, note: null },
    { onConflict: "game_id,player_id" }
  );

  try {
    await page.goto(`/d/${PAST_DATE}`);

    // Click the admin "out" button for Target Player. The button's accessible name is "Set Target Player to out".
    const outBtn = page.getByRole("button", { name: /Set Target Player to out/i });
    await expect(outBtn).toBeVisible();
    await outBtn.click();

    // Verify in DB that the status changed.
    await expect
      .poll(async () => {
        const { data } = await admin
          .from("rsvps")
          .select("status")
          .eq("game_id", gameRow!.id)
          .eq("player_id", targetId)
          .maybeSingle();
        return data?.status;
      })
      .toBe("out");
  } finally {
    await admin.from("rsvps").delete().eq("player_id", targetId);
    await admin.auth.admin.deleteUser(targetId);
    await admin.from("players").update({ is_admin: false }).eq("id", authedUser.userId);
  }
});

test("invalid date returns 404", async ({ page }) => {
  const res = await page.goto("/d/2026-99-99");
  expect(res?.status()).toBe(404);
});
```

- [ ] **Step 2: Run the test**

Run: `npm run test:e2e -- historical-roster.spec.ts`
Expected: PASS — three test cases.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/historical-roster.spec.ts
git commit -m "Add E2E test for historical roster page"
```

---

## Task 10: Final verification

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run the full unit test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Run the full E2E suite**

Run: `npm run test:e2e`
Expected: PASS.

- [ ] **Step 4: Manual smoke**

Start dev: `npm run dev`. Open `http://devbox:3000/` — confirm RSVP works as before. Open `http://devbox:3000/d/<today>` — same content. Open `http://devbox:3000/d/<a past date>` — confirm read-only behavior. Stop dev server.

- [ ] **Step 5: Confirm tree is clean**

Run: `git status`
Expected: clean working tree.
