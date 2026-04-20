# OldManHoops Reminders Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two Vercel-scheduled cron routes: `GET /api/cron/housekeeping` (advances past scheduled games to completed + creates today's game on weekdays) and `GET /api/cron/remind` (sends daily reminder emails with three one-click RSVP buttons). Wire them into `vercel.json` and ship a Resend-backed email pipeline.

**Architecture:** Two Next.js App Router route handlers under `app/api/cron/`. Both are guarded by a `Bearer ${CRON_SECRET}` auth check and wrapped in a top-level try/catch that emails `ADMIN_EMAIL` on uncaught failure (then rethrows so Vercel marks the run failed). Business logic is factored into small pure-ish functions in `lib/` so we can unit-test them against the real local Supabase without needing to invoke the route. Email sending lives behind a thin `lib/email/send.ts` module so tests can `jest.mock()` it; reminder HTML is built by a pure `lib/email/reminder.ts` that reuses the existing `signToken` to embed HMAC-signed one-click links.

**Tech Stack:** Next.js 16 App Router, `resend` SDK (already installed), Luxon (for TZ-aware weekday checks), existing `lib/hmac.ts` / `lib/supabase/admin.ts` / `lib/env.ts`, Jest.

**Prerequisites:**
- Plans 1–4 complete. Tags: `foundation-complete`, `auth-complete`, `scoreboard-complete`, `rsvp-complete`.
- Local Supabase stack running (`supabase start`) with migrations applied.
- `.env.local` populated with `RESEND_API_KEY`, `ADMIN_EMAIL`, `CRON_SECRET`, `HMAC_SECRET`, `APP_TIMEZONE`.

---

## Design Decisions

**Cron auth — Bearer header.** Vercel Cron invokes cron paths with an `Authorization: Bearer ${CRON_SECRET}` header when `CRON_SECRET` is set in project env. We check that header; any mismatch returns 401. Same pattern Vercel documents for their own examples.

**From address — new env var.** Resend requires either a verified domain or their `onboarding@resend.dev` test sender. Add `EMAIL_FROM` env (required) so prod can swap to `reminders@oldmanhoops.app` (or similar) after domain verification without a code change. Dev uses `OldManHoops <onboarding@resend.dev>`.

**Cron schedule — fixed UTC.** Vercel Cron only accepts fixed UTC. Per the spec, the app's *date* logic (which game_date we resolve as "today") runs in `APP_TIMEZONE` via Luxon so it's DST-correct. Only the cron *firing time* drifts by one hour across DST — acceptable:
- Housekeeping: `0 11 * * *` (11:00 UTC → 06:00 EST / 07:00 EDT)
- Reminders: `30 11 * * *` (11:30 UTC → 06:30 EST / 07:30 EDT)

The 30-minute gap between them protects against a slow housekeeping run leaving the remind job without a game row.

**Email template — hand-rolled HTML string.** One file per layout. No MJML/react-email — we have exactly one email. Inline styles, simple table-based buttons that render in most clients. Text fallback is the URL list.

**Resend mockability.** `lib/email/send.ts` exports a single `sendEmail(to, subject, html)` function. Tests `jest.mock("@/lib/email/send")` to replace it with `jest.fn()`. No DI plumbing through handlers.

**Admin-error notifier.** A one-off `notifyAdmin(subject, body)` helper in `lib/email/send.ts` calls Resend directly — it is **not** routed through `sendEmail` so that a bug in `sendEmail` won't prevent delivery of its own error email. It also `console.error`s the original failure so we still capture it in Vercel logs if the notify-email itself fails.

**Per-player failure isolation in remind cron.** One player's email failure must not break the whole batch. Wrap each send in try/catch, `console.error` with player email + error message, continue the loop. The handler returns counts `{ sent, failed }`; the outer try/catch still catches truly exceptional conditions (DB down, player query exploded).

**Weekday check.** Add `isGameDay(dateStr, zone)` to `lib/date.ts`. Luxon's `weekday` is 1=Mon..7=Sun; Mon–Fri means `1..5`.

**Resetting past games.** The past-game sweep uses a single `UPDATE games SET status='completed' WHERE game_date < today AND status='scheduled'`. Service role, so no RLS concerns. Self-heals if cron missed prior days.

**Querying players with email.** Email lives in `auth.users`, so the remind cron uses `admin.auth.admin.listUsers()` to get user emails and joins with `players` on `id` in memory. Simpler and more portable than crossing the `auth.users` boundary in a PostgREST call (which the default admin client can't easily do without an RPC). Player count is bounded (≤30 active), so in-memory join is fine.

---

## File Structure Introduced

```
lib/
├── date.ts                        # EXTEND: add isGameDay
└── email/
    ├── send.ts                    # sendEmail + notifyAdmin (Resend wrappers)
    └── reminder.ts                # buildReminderEmail (pure)
app/
└── api/
    └── cron/
        ├── housekeeping/
        │   └── route.ts           # GET — past→completed, today upsert
        └── remind/
            └── route.ts           # GET — per-player reminder send
tests/
└── unit/
    ├── date.test.ts               # EXTEND: isGameDay
    ├── email-reminder.test.ts     # reminder HTML / link signing
    ├── api-cron-housekeeping.test.ts
    └── api-cron-remind.test.ts
vercel.json                        # EXTEND: add two cron schedules
.env.example                       # EXTEND: add EMAIL_FROM
lib/env.ts                         # EXTEND: add EMAIL_FROM
```

---

## Task 1: Add `isGameDay` weekday helper

**Files:**
- Modify: `lib/date.ts`
- Test: `tests/unit/date.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/date.test.ts`:

```ts
import { isGameDay } from "@/lib/date";

describe("isGameDay", () => {
  it("returns true for a Monday in America/New_York", () => {
    // 2026-04-20 is a Monday
    expect(isGameDay("2026-04-20", "America/New_York")).toBe(true);
  });

  it("returns true for Friday", () => {
    // 2026-04-24 is a Friday
    expect(isGameDay("2026-04-24", "America/New_York")).toBe(true);
  });

  it("returns false for Saturday", () => {
    // 2026-04-25 is a Saturday
    expect(isGameDay("2026-04-25", "America/New_York")).toBe(false);
  });

  it("returns false for Sunday", () => {
    // 2026-04-26 is a Sunday
    expect(isGameDay("2026-04-26", "America/New_York")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/unit/date.test.ts
```
Expected: FAIL — `isGameDay is not a function` (or similar import error).

- [ ] **Step 3: Implement `isGameDay`**

Append to `lib/date.ts`:

```ts
export function isGameDay(dateStr: string, zone: string = env.APP_TIMEZONE): boolean {
  const dt = DateTime.fromFormat(dateStr, "yyyy-MM-dd", { zone });
  // Luxon: 1 = Monday, 7 = Sunday
  return dt.weekday >= 1 && dt.weekday <= 5;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/unit/date.test.ts
```
Expected: PASS (existing `getToday` / `formatGameDate` tests still green).

- [ ] **Step 5: Commit**

```bash
git add lib/date.ts tests/unit/date.test.ts
git commit -m "Add isGameDay helper for Mon-Fri check in APP_TIMEZONE"
```

---

## Task 2: Add `EMAIL_FROM` env var

**Files:**
- Modify: `lib/env.ts`
- Modify: `.env.example`
- Test: `tests/unit/env.test.ts`

- [ ] **Step 1: Write the failing test**

Open `tests/unit/env.test.ts` and add a test for `EMAIL_FROM`. If the file already asserts required keys in a list, add `"EMAIL_FROM"` to that list. If it tests individual keys, add:

```ts
it("includes EMAIL_FROM", () => {
  expect(env.EMAIL_FROM).toBeDefined();
  expect(typeof env.EMAIL_FROM).toBe("string");
  expect(env.EMAIL_FROM.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest tests/unit/env.test.ts
```
Expected: FAIL — `EMAIL_FROM is not defined on env` or `Missing required env var: EMAIL_FROM`.

- [ ] **Step 3: Add `EMAIL_FROM` to the env schema**

Modify `lib/env.ts`:

```ts
export const env = {
  NEXT_PUBLIC_SUPABASE_URL: require_(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: require_(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
  SUPABASE_SERVICE_ROLE_KEY: require_(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ),
  SIGNUP_CODE: require_("SIGNUP_CODE", process.env.SIGNUP_CODE),
  HMAC_SECRET: require_("HMAC_SECRET", process.env.HMAC_SECRET),
  CRON_SECRET: require_("CRON_SECRET", process.env.CRON_SECRET),
  APP_TIMEZONE: require_("APP_TIMEZONE", process.env.APP_TIMEZONE),
  ADMIN_EMAIL: require_("ADMIN_EMAIL", process.env.ADMIN_EMAIL),
  RESEND_API_KEY: require_("RESEND_API_KEY", process.env.RESEND_API_KEY),
  EMAIL_FROM: require_("EMAIL_FROM", process.env.EMAIL_FROM),
} as const;
```

Modify `.env.example`, append at the bottom:

```
# Resend "from" address. Use "OldManHoops <onboarding@resend.dev>" for dev
# (Resend's verification-free sender). Swap to a verified domain in prod.
EMAIL_FROM=OldManHoops <onboarding@resend.dev>
```

Also add the same line to `.env.local` on your dev machine so tests can load it. (If `.env.local` isn't set, the env test will keep failing — that is intentional.)

- [ ] **Step 4: Add `EMAIL_FROM` to your local `.env.local`**

```bash
echo 'EMAIL_FROM="OldManHoops <onboarding@resend.dev>"' >> .env.local
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest tests/unit/env.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/env.ts .env.example tests/unit/env.test.ts
git commit -m "Require EMAIL_FROM env for Resend sender address"
```

---

## Task 3: Email sender module (`sendEmail` + `notifyAdmin`)

**Files:**
- Create: `lib/email/send.ts`
- Test: covered indirectly by Tasks 4 & 5 (we mock this module in cron tests). No dedicated unit test — it's a thin SDK wrapper and mocking Resend to test its own wrapping has little payoff.

- [ ] **Step 1: Create the sender module**

Create `lib/email/send.ts`:

```ts
import { Resend } from "resend";
import { env } from "@/lib/env";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ id?: string; error?: string }> {
  const resend = getClient();
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
  });
  if (error) return { error: error.message };
  return { id: data?.id };
}

export async function notifyAdmin(subject: string, body: string): Promise<void> {
  try {
    const resend = getClient();
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: env.ADMIN_EMAIL,
      subject: `[OldManHoops admin] ${subject}`,
      text: body,
    });
  } catch (err) {
    console.error("notifyAdmin failed:", err);
  }
}
```

- [ ] **Step 2: Typecheck compiles**

```bash
npx tsc --noEmit
```
Expected: no errors related to `lib/email/send.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/email/send.ts
git commit -m "Add sendEmail and notifyAdmin Resend wrappers"
```

---

## Task 4: Reminder email template (`buildReminderEmail`)

**Files:**
- Create: `lib/email/reminder.ts`
- Test: `tests/unit/email-reminder.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/email-reminder.test.ts`:

```ts
/** @jest-environment node */
import { buildReminderEmail } from "@/lib/email/reminder";
import { verifyToken } from "@/lib/hmac";

const SECRET = "test-secret-32-bytes-base64-abcdefg";

describe("buildReminderEmail", () => {
  const baseInput = {
    playerName: "Jordan",
    playerId: "player-123",
    gameId: "game-456",
    gameDateText: "Monday, April 20",
    baseUrl: "https://oldmanhoops.test",
    hmacSecret: SECRET,
  };

  it("returns a subject mentioning today's date", () => {
    const email = buildReminderEmail(baseInput);
    expect(email.subject).toMatch(/old ?man ?hoops/i);
    expect(email.subject).toMatch(/playing/i);
  });

  it("embeds three RSVP links with valid HMAC tokens", () => {
    const email = buildReminderEmail(baseInput);
    // Match href="https://.../api/rsvp?token=...&status=in|out|maybe&player_id=...&game_id=..."
    const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const rsvpHrefs = hrefs.filter((h) => h.includes("/api/rsvp"));
    expect(rsvpHrefs).toHaveLength(3);

    for (const status of ["in", "out", "maybe"] as const) {
      const link = rsvpHrefs.find((h) => h.includes(`status=${status}`));
      expect(link).toBeDefined();
      const url = new URL(link!);
      expect(url.origin).toBe("https://oldmanhoops.test");
      expect(url.pathname).toBe("/api/rsvp");
      expect(url.searchParams.get("player_id")).toBe("player-123");
      expect(url.searchParams.get("game_id")).toBe("game-456");
      expect(url.searchParams.get("status")).toBe(status);
      const token = url.searchParams.get("token")!;
      const v = verifyToken(token, SECRET);
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.payload.player_id).toBe("player-123");
        expect(v.payload.game_id).toBe("game-456");
        expect(v.payload.status).toBe(status);
        // Expiry should be ~8 hours in the future (allow ±2 min slop)
        const delta = v.payload.expires_at - Date.now();
        expect(delta).toBeGreaterThan(7 * 60 * 60 * 1000);
        expect(delta).toBeLessThan(9 * 60 * 60 * 1000);
      }
    }
  });

  it("greets the player by name", () => {
    const email = buildReminderEmail(baseInput);
    expect(email.html).toContain("Jordan");
  });

  it("falls back gracefully when name is empty", () => {
    const email = buildReminderEmail({ ...baseInput, playerName: "" });
    // Should still render without blowing up; greeting can be generic
    expect(email.html).toMatch(/old ?man ?hoops/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/unit/email-reminder.test.ts
```
Expected: FAIL — cannot find module `@/lib/email/reminder`.

- [ ] **Step 3: Implement `buildReminderEmail`**

Create `lib/email/reminder.ts`:

```ts
import { signToken, type RsvpStatus } from "@/lib/hmac";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

interface ReminderInput {
  playerName: string;
  playerId: string;
  gameId: string;
  gameDateText: string;
  baseUrl: string;
  hmacSecret: string;
  now?: number;
}

interface Email {
  subject: string;
  html: string;
}

function buildLink(
  base: string,
  playerId: string,
  gameId: string,
  status: RsvpStatus,
  token: string
): string {
  const u = new URL("/api/rsvp", base);
  u.searchParams.set("token", token);
  u.searchParams.set("status", status);
  u.searchParams.set("player_id", playerId);
  u.searchParams.set("game_id", gameId);
  return u.toString();
}

function button(href: string, label: string, bg: string): string {
  return `
    <a href="${href}"
       style="display:inline-block;padding:12px 24px;margin:4px;
              border-radius:8px;background:${bg};color:#fff;
              font-weight:600;text-decoration:none;font-family:system-ui,sans-serif;">
      ${label}
    </a>`;
}

export function buildReminderEmail(input: ReminderInput): Email {
  const now = input.now ?? Date.now();
  const expires = now + EIGHT_HOURS_MS;

  const tokens: Record<RsvpStatus, string> = {
    in: signToken(
      { player_id: input.playerId, game_id: input.gameId, status: "in", expires_at: expires },
      input.hmacSecret
    ),
    out: signToken(
      { player_id: input.playerId, game_id: input.gameId, status: "out", expires_at: expires },
      input.hmacSecret
    ),
    maybe: signToken(
      { player_id: input.playerId, game_id: input.gameId, status: "maybe", expires_at: expires },
      input.hmacSecret
    ),
  };

  const inLink = buildLink(input.baseUrl, input.playerId, input.gameId, "in", tokens.in);
  const outLink = buildLink(input.baseUrl, input.playerId, input.gameId, "out", tokens.out);
  const maybeLink = buildLink(input.baseUrl, input.playerId, input.gameId, "maybe", tokens.maybe);

  const greeting = input.playerName ? `Hey ${input.playerName},` : "Hey,";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,sans-serif;color:#111;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:#d97706;">Old Man Hoops</h1>
      <p style="margin:0 0 16px;color:#555;">${input.gameDateText} — noon at One Athletics.</p>
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 20px;">Are you playing today?</p>
      <div style="text-align:center;">
        ${button(inLink, "I'm In", "#059669")}
        ${button(outLink, "I'm Out", "#dc2626")}
        ${button(maybeLink, "Maybe", "#0284c7")}
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#888;">
        Links expire in 8 hours. Manage preferences at ${input.baseUrl}/settings.
      </p>
    </div>
  </body>
</html>`;

  return {
    subject: "Old Man Hoops — Are you playing today?",
    html,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/unit/email-reminder.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/reminder.ts tests/unit/email-reminder.test.ts
git commit -m "Add buildReminderEmail with HMAC-signed one-click links"
```

---

## Task 5: Housekeeping cron route

**Files:**
- Create: `app/api/cron/housekeeping/route.ts`
- Test: `tests/unit/api-cron-housekeeping.test.ts`

**Behaviour:**
- Requires `Authorization: Bearer ${CRON_SECRET}` — 401 otherwise.
- `UPDATE games SET status='completed' WHERE game_date < today AND status='scheduled'`.
- If today is a weekday in `APP_TIMEZONE`: upsert `games(game_date=today, status='scheduled')` via `onConflict: game_date` (idempotent).
- Returns `200 { ok: true, today, todayIsGameDay, gamesCompleted, gameCreated }`.
- On uncaught error: call `notifyAdmin(...)` then rethrow (Vercel marks failed).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/api-cron-housekeeping.test.ts`:

```ts
/** @jest-environment node */
jest.mock("@/lib/email/send", () => ({
  sendEmail: jest.fn().mockResolvedValue({ id: "mock" }),
  notifyAdmin: jest.fn().mockResolvedValue(undefined),
}));

import { GET } from "@/app/api/cron/housekeeping/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday } from "@/lib/date";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/cron/housekeeping", {
    method: "GET",
    headers,
  });
}

async function wipeGames() {
  const admin = createAdminClient();
  await admin.from("games").delete().neq("game_date", "1900-01-01");
}

describe("GET /api/cron/housekeeping", () => {
  beforeEach(async () => {
    await wipeGames();
  });

  afterAll(async () => {
    await wipeGames();
  });

  it("rejects requests without the bearer secret", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("rejects requests with a wrong bearer secret", async () => {
    const res = await GET(
      makeRequest({ Authorization: "Bearer wrong" })
    );
    expect(res.status).toBe(401);
  });

  it("marks past scheduled games as completed", async () => {
    const admin = createAdminClient();
    // Seed a past scheduled game
    const past = "2020-01-06"; // a Monday, safely in the past
    await admin.from("games").insert({ game_date: past, status: "scheduled" });

    const res = await GET(
      makeRequest({ Authorization: `Bearer ${CRON_SECRET}` })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gamesCompleted).toBeGreaterThanOrEqual(1);

    const { data } = await admin
      .from("games")
      .select("status")
      .eq("game_date", past)
      .single();
    expect(data?.status).toBe("completed");
  });

  it("creates today's game row when today is a weekday", async () => {
    // This test assumes the test run happens on a weekday in APP_TIMEZONE.
    // Verify that assumption and skip otherwise.
    const today = getToday();
    const { DateTime } = await import("luxon");
    const weekday = DateTime.fromFormat(today, "yyyy-MM-dd", {
      zone: process.env.APP_TIMEZONE,
    }).weekday;
    if (weekday >= 6) {
      // Saturday/Sunday: skip this assertion
      return;
    }

    const res = await GET(
      makeRequest({ Authorization: `Bearer ${CRON_SECRET}` })
    );
    expect(res.status).toBe(200);

    const admin = createAdminClient();
    const { data } = await admin
      .from("games")
      .select("game_date, status")
      .eq("game_date", today)
      .single();
    expect(data).toBeTruthy();
    expect(data?.status).toBe("scheduled");
  });

  it("is idempotent when run twice on the same day", async () => {
    const headers = { Authorization: `Bearer ${CRON_SECRET}` };
    const first = await GET(makeRequest(headers));
    expect(first.status).toBe(200);
    const second = await GET(makeRequest(headers));
    expect(second.status).toBe(200);

    // Verify only one row for today exists
    const today = getToday();
    const admin = createAdminClient();
    const { data } = await admin
      .from("games")
      .select("id")
      .eq("game_date", today);
    expect((data ?? []).length).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/unit/api-cron-housekeeping.test.ts
```
Expected: FAIL — cannot resolve `@/app/api/cron/housekeeping/route`.

- [ ] **Step 3: Implement the route**

Create `app/api/cron/housekeeping/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday, isGameDay } from "@/lib/date";
import { env } from "@/lib/env";
import { notifyAdmin } from "@/lib/email/send";

function checkAuth(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;
  return header === expected;
}

export async function GET(request: Request): Promise<Response> {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const today = getToday();

    // Mark past scheduled games as completed.
    const { data: completed, error: completeErr } = await admin
      .from("games")
      .update({ status: "completed" })
      .lt("game_date", today)
      .eq("status", "scheduled")
      .select("id");
    if (completeErr) throw new Error(`completeErr: ${completeErr.message}`);

    let gameCreated = false;
    const todayIsGameDay = isGameDay(today);
    if (todayIsGameDay) {
      const { error: upsertErr } = await admin
        .from("games")
        .upsert(
          { game_date: today, status: "scheduled" },
          { onConflict: "game_date", ignoreDuplicates: true }
        );
      if (upsertErr) throw new Error(`upsertErr: ${upsertErr.message}`);
      gameCreated = true;
    }

    return NextResponse.json({
      ok: true,
      today,
      todayIsGameDay,
      gamesCompleted: completed?.length ?? 0,
      gameCreated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? "" : "";
    await notifyAdmin(
      "Housekeeping cron failed",
      `Error: ${message}\n\nStack:\n${stack}`
    );
    throw err;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/unit/api-cron-housekeeping.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/housekeeping/route.ts tests/unit/api-cron-housekeeping.test.ts
git commit -m "Add GET /api/cron/housekeeping: complete past games, create today's"
```

---

## Task 6: Reminder cron route

**Files:**
- Create: `app/api/cron/remind/route.ts`
- Test: `tests/unit/api-cron-remind.test.ts`

**Behaviour:**
- Requires `Authorization: Bearer ${CRON_SECRET}` — 401 otherwise.
- Fetch today's game; if missing or cancelled, return `200 { ok: true, skipped: "<reason>" }`.
- Fetch all auth users (`admin.auth.admin.listUsers()`), join with `players` where `active=true AND reminder_email=true`.
- For each matching player: `buildReminderEmail` → `sendEmail`. Per-send failures → `console.error` and continue.
- Returns `200 { ok: true, sent, failed, total }`.
- On uncaught error: `notifyAdmin(...)` then rethrow.
- `NEXT_PUBLIC_APP_URL` not required — derive `baseUrl` from the `request.url` origin (works in prod where Vercel sets the correct host; works in dev via devbox).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/api-cron-remind.test.ts`:

```ts
/** @jest-environment node */
const mockSend = jest.fn();
const mockNotify = jest.fn();
jest.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSend(...args),
  notifyAdmin: (...args: unknown[]) => mockNotify(...args),
}));

import { GET } from "@/app/api/cron/remind/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday } from "@/lib/date";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/cron/remind", {
    method: "GET",
    headers,
  });
}

async function wipeGamesAndRsvps() {
  const admin = createAdminClient();
  await admin.from("rsvps").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("games").delete().neq("game_date", "1900-01-01");
}

async function seedGame(status: "scheduled" | "cancelled" = "scheduled") {
  const admin = createAdminClient();
  const today = getToday();
  const { data } = await admin
    .from("games")
    .upsert({ game_date: today, status }, { onConflict: "game_date" })
    .select()
    .single();
  return data!;
}

async function createPlayer(opts: {
  email: string;
  name: string;
  active?: boolean;
  reminder_email?: boolean;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    email_confirm: true,
    user_metadata: { name: opts.name },
  });
  if (error) throw error;
  const userId = data.user!.id;
  // handle_new_user trigger inserts players row; update flags if requested
  if (opts.active !== undefined || opts.reminder_email !== undefined) {
    await admin
      .from("players")
      .update({
        ...(opts.active !== undefined ? { active: opts.active } : {}),
        ...(opts.reminder_email !== undefined ? { reminder_email: opts.reminder_email } : {}),
      })
      .eq("id", userId);
  }
  return { userId, email: opts.email };
}

async function deletePlayer(userId: string) {
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
}

describe("GET /api/cron/remind", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockNotify.mockReset();
    mockSend.mockResolvedValue({ id: "mock-id" });
  });

  it("rejects requests without the bearer secret", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("skips when today has no game row", async () => {
    await wipeGamesAndRsvps();
    const res = await GET(
      makeRequest({ Authorization: `Bearer ${CRON_SECRET}` })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBeTruthy();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("skips when today's game is cancelled", async () => {
    await wipeGamesAndRsvps();
    await seedGame("cancelled");
    const res = await GET(
      makeRequest({ Authorization: `Bearer ${CRON_SECRET}` })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toMatch(/cancel/i);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends emails to opted-in active players and excludes others", async () => {
    // NOTE: The local test database may already contain players from earlier
    // tests (e.g. api-signup). We therefore only assert presence/absence of
    // our specific emails, not exact counts.
    await wipeGamesAndRsvps();
    await seedGame("scheduled");

    const stamp = Date.now();
    const a = await createPlayer({ email: `remind-a-${stamp}@example.com`, name: "Alpha" });
    const b = await createPlayer({ email: `remind-b-${stamp}@example.com`, name: "Beta" });
    const optedOut = await createPlayer({
      email: `remind-c-${stamp}@example.com`,
      name: "Charlie",
      reminder_email: false,
    });
    const inactive = await createPlayer({
      email: `remind-d-${stamp}@example.com`,
      name: "Delta",
      active: false,
    });

    try {
      const res = await GET(
        makeRequest({ Authorization: `Bearer ${CRON_SECRET}` })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sent).toBeGreaterThanOrEqual(2);
      // Every call pair is (to, subject, html). `sent` equals successful
      // sends; mockSend was called once per candidate.
      expect(mockSend).toHaveBeenCalled();

      const recipients = mockSend.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(recipients).toContain(a.email);
      expect(recipients).toContain(b.email);
      expect(recipients).not.toContain(optedOut.email);
      expect(recipients).not.toContain(inactive.email);
    } finally {
      await deletePlayer(a.userId);
      await deletePlayer(b.userId);
      await deletePlayer(optedOut.userId);
      await deletePlayer(inactive.userId);
    }
  });

  it("continues past a send failure and reports the failed count", async () => {
    await wipeGamesAndRsvps();
    await seedGame("scheduled");

    const stamp = Date.now();
    const a = await createPlayer({ email: `remind-fail-a-${stamp}@example.com`, name: "Alpha" });
    const b = await createPlayer({ email: `remind-fail-b-${stamp}@example.com`, name: "Beta" });

    // Make any send to player A fail; everyone else succeeds. We can't rely
    // on call order across the pre-existing player set, so match by recipient.
    mockSend.mockImplementation(async (to: string) => {
      if (to === a.email) return { error: "boom" };
      return { id: "ok" };
    });

    try {
      const res = await GET(
        makeRequest({ Authorization: `Bearer ${CRON_SECRET}` })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.failed).toBeGreaterThanOrEqual(1);
      expect(body.sent).toBeGreaterThanOrEqual(1);
      expect(body.total).toBe(body.sent + body.failed);
    } finally {
      await deletePlayer(a.userId);
      await deletePlayer(b.userId);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest tests/unit/api-cron-remind.test.ts
```
Expected: FAIL — cannot resolve `@/app/api/cron/remind/route`.

- [ ] **Step 3: Implement the route**

Create `app/api/cron/remind/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday, formatGameDate } from "@/lib/date";
import { env } from "@/lib/env";
import { buildReminderEmail } from "@/lib/email/reminder";
import { sendEmail, notifyAdmin } from "@/lib/email/send";

function checkAuth(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${env.CRON_SECRET}`;
}

interface PlayerRow {
  id: string;
  name: string;
  active: boolean;
  reminder_email: boolean;
}

export async function GET(request: Request): Promise<Response> {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const today = getToday();

    const { data: game, error: gameErr } = await admin
      .from("games")
      .select("id, status")
      .eq("game_date", today)
      .maybeSingle();
    if (gameErr) throw new Error(`gameErr: ${gameErr.message}`);
    if (!game) {
      return NextResponse.json({ ok: true, skipped: "no-game-today" });
    }
    if (game.status === "cancelled") {
      return NextResponse.json({ ok: true, skipped: "cancelled" });
    }

    // Active + opted-in players
    const { data: players, error: playersErr } = await admin
      .from("players")
      .select("id, name, active, reminder_email")
      .eq("active", true)
      .eq("reminder_email", true);
    if (playersErr) throw new Error(`playersErr: ${playersErr.message}`);
    const rows = (players ?? []) as PlayerRow[];
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, failed: 0, total: 0 });
    }

    // Fetch emails from auth.users (paginated; 30 active players easily fits one page)
    const byId = new Map<string, string>();
    let page = 1;
    // listUsers returns up to 1000 per page; loop until we've covered all
    // NOTE: limited to a few pages for safety
    for (let i = 0; i < 10; i++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`listUsersErr: ${error.message}`);
      for (const u of data.users) {
        if (u.email) byId.set(u.id, u.email);
      }
      if (data.users.length < 200) break;
      page += 1;
    }

    const baseUrl = new URL(request.url).origin;
    const gameDateText = formatGameDate(today);

    let sent = 0;
    let failed = 0;
    for (const p of rows) {
      const email = byId.get(p.id);
      if (!email) {
        console.error(`remind: no auth.users email for player ${p.id}`);
        failed += 1;
        continue;
      }
      const { subject, html } = buildReminderEmail({
        playerName: p.name,
        playerId: p.id,
        gameId: game.id,
        gameDateText,
        baseUrl,
        hmacSecret: env.HMAC_SECRET,
      });
      try {
        const result = await sendEmail(email, subject, html);
        if (result.error) {
          console.error(`remind: send failed for ${email}: ${result.error}`);
          failed += 1;
        } else {
          sent += 1;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`remind: send threw for ${email}: ${msg}`);
        failed += 1;
      }
    }

    return NextResponse.json({ ok: true, sent, failed, total: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? "" : "";
    await notifyAdmin(
      "Reminder cron failed",
      `Error: ${message}\n\nStack:\n${stack}`
    );
    throw err;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest tests/unit/api-cron-remind.test.ts
```
Expected: PASS (5 tests). If a test that creates players fails on the trigger (missing name column default), re-read `supabase/migrations/20260419230522_handle_new_user.sql` to confirm `name` defaults to `''`.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/remind/route.ts tests/unit/api-cron-remind.test.ts
git commit -m "Add GET /api/cron/remind: send reminder emails to opted-in players"
```

---

## Task 7: Wire Vercel Cron schedules

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Update `vercel.json`**

Replace the contents of `vercel.json` with:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/housekeeping", "schedule": "0 11 * * *" },
    { "path": "/api/cron/remind", "schedule": "30 11 * * *" }
  ]
}
```

- [ ] **Step 2: Verify the JSON is valid**

```bash
node --input-type=module -e 'console.log(JSON.parse(await import("fs").then(m=>m.promises.readFile("vercel.json","utf8"))))'
```
Expected: object logged with a `crons` array of length 2.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "Schedule housekeeping (11:00 UTC) and remind (11:30 UTC) crons"
```

---

## Task 8: Full-suite regression check

- [ ] **Step 1: Run the entire unit suite**

```bash
npm test
```
Expected: all suites pass. If anything red, fix before proceeding.

- [ ] **Step 2: Run the Playwright smoke test**

```bash
npm run test:e2e
```
Expected: existing smoke tests still pass (Plan 5 did not touch UI).

- [ ] **Step 3: Commit** (only if any incidental fixes were needed)

```bash
git status  # should be clean; if not, inspect and commit fixes
```

---

## Task 9: Local manual smoke — housekeeping

- [ ] **Step 1: Start Supabase + Next dev server in two terminals**

```bash
supabase start
npm run dev
```

- [ ] **Step 2: Wipe today's game row**

```bash
SUPABASE_DB_URL=${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:55322/postgres}
psql "$SUPABASE_DB_URL" -c "DELETE FROM games WHERE game_date = CURRENT_DATE;"
```

- [ ] **Step 3: Invoke the housekeeping cron**

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '"')
curl -sS -H "Authorization: Bearer ${CRON_SECRET}" http://devbox:3000/api/cron/housekeeping | jq
```

Expected output (on a weekday):
```json
{ "ok": true, "today": "YYYY-MM-DD", "todayIsGameDay": true, "gamesCompleted": 0, "gameCreated": true }
```

- [ ] **Step 4: Verify today's game exists**

```bash
psql "$SUPABASE_DB_URL" -c "SELECT game_date, status FROM games ORDER BY game_date DESC LIMIT 3;"
```
Expected: a row for today with `status = scheduled`.

- [ ] **Step 5: Negative check — wrong secret**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer wrong" \
  http://devbox:3000/api/cron/housekeeping
```
Expected: `401`.

---

## Task 10: Local manual smoke — reminders

- [ ] **Step 1: Verify today's game exists and is scheduled**

(Carry over from Task 9.)

- [ ] **Step 2: Trigger the reminder cron**

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '"')
curl -sS -H "Authorization: Bearer ${CRON_SECRET}" http://devbox:3000/api/cron/remind | jq
```

Expected JSON:
```json
{ "ok": true, "sent": <N>, "failed": 0, "total": <N> }
```
where `N` is the count of active + opted-in players in your local stack.

- [ ] **Step 3: Inspect Resend dashboard**

Open https://resend.com/emails — you should see the outgoing reminder(s) for any players whose email matches a domain Resend permits you to send to from `onboarding@resend.dev` (Resend restricts unverified senders to your own account's email). Any rejected sends show as `failed` in the cron response and in Vercel logs in prod.

- [ ] **Step 4: Inspect the HTML**

In Resend's dashboard, open one of the sent emails and confirm:
- Three buttons labelled "I'm In", "I'm Out", "Maybe"
- Each link is `http://devbox:3000/api/rsvp?token=...&status=...&player_id=...&game_id=...`

- [ ] **Step 5: Click "I'm In" on the email**

Browser should land on `http://devbox:3000/?status=in` logged in as that player, with the green confirmation banner visible. The RSVPs count should reflect the new In vote.

---

## Task 11: Tag the plan complete

- [ ] **Step 1: Tag the commit**

```bash
git tag reminders-complete
```

- [ ] **Step 2: Push if desired**

```bash
git push
git push --tags
```

---

## Self-Review Checklist

Before handoff, confirm:

- [ ] Every step with code shows the code, not a placeholder.
- [ ] `isGameDay` signature matches what Task 5 imports.
- [ ] `buildReminderEmail` signature matches what Task 6 imports (`playerName`, `playerId`, `gameId`, `gameDateText`, `baseUrl`, `hmacSecret`).
- [ ] `sendEmail(to, subject, html)` and `notifyAdmin(subject, body)` signatures match their call sites in Tasks 5 & 6.
- [ ] `env.EMAIL_FROM` is added before it is read by `sendEmail` / `notifyAdmin`.
- [ ] Both cron routes check `Authorization: Bearer ${CRON_SECRET}` before any work.
- [ ] Neither cron route returns early on missing `APP_TIMEZONE` — `lib/env.ts` already requires it, so a missing value fails at module load, which is what we want.
- [ ] The reminder route derives `baseUrl` from `request.url` (so dev and prod both work without a new env var).
- [ ] Handlers rethrow after `notifyAdmin` so Vercel marks failed runs failed.
- [ ] Tests clean up any `auth.users` rows they create via `admin.auth.admin.deleteUser`.

---

## Out of Scope / Deferred

- Cancellation notification emails (per spec "Out of Scope v1").
- Admin dashboard / resend-one-reminder button (manual `curl` is fine for v1).
- Per-player reminder send times (all players get the same 7 AM local send).
- Opt-out link directly inside the email (players manage via `/settings`, Plan 6).
