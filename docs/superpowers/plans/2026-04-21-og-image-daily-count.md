# Daily Open Graph Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shared links to Old Man Hoops render an OG preview card showing today's `IN` and `MAYBE` counts (with fallbacks for no-game / cancelled days), so people can decide at a glance whether there's a game on.

**Architecture:** A dynamic route at `app/og/[date]/route.tsx` uses `next/og`'s `ImageResponse` to render a 1200×630 PNG. The home page's `generateMetadata` points `og:image` at today's date-stamped URL so crawler caches can't go stale across days. Counts come from an anon Supabase client via a new `getOgCounts` helper — independent of cookie-bound auth because games/rsvps are public-readable.

**Tech Stack:** Next.js 16 App Router, React 19, `next/og` (`ImageResponse`), `@supabase/supabase-js` (anon client), Luxon (date formatting), Jest (tests hit local Supabase — pattern established in `tests/unit/scoreboard.test.ts`).

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `lib/og.ts` | `OgCardData` type + `getOgCounts(supabase, date)` — computes in/maybe totals for a given date. | create |
| `tests/unit/og-counts.test.ts` | Integration tests for `getOgCounts` against local Supabase. | create |
| `lib/site-url.ts` | Add `getSiteOrigin()` request-free variant alongside existing `siteOrigin(request)`. | modify |
| `tests/unit/site-url.test.ts` | Unit tests for `getSiteOrigin`. | create |
| `app/og/[date]/route.tsx` | Dynamic route — validates date, fetches counts, returns `ImageResponse` PNG with cache headers. Inline JSX for the card layout. | create |
| `tests/unit/og-route.test.ts` | Integration tests for the route handler. | create |
| `app/page.tsx` | Add `generateMetadata` exporting today's OG URL in `metadata.openGraph` / `metadata.twitter`. | modify |

Card JSX lives inline in `route.tsx` since it's used exactly once. The data helper and site-url helpers are the only reusable pieces.

---

## Task 1: `getOgCounts` data helper

**Files:**
- Create: `lib/og.ts`
- Test: `tests/unit/og-counts.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `tests/unit/og-counts.test.ts` matching the integration pattern from `tests/unit/scoreboard.test.ts`:

```ts
/** @jest-environment node */
import { Pool } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOgCounts } from "@/lib/og";

const CONN = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

let pool: Pool;
let admin: ReturnType<typeof createAdminClient>;

beforeAll(() => {
  pool = new Pool({ connectionString: CONN });
  admin = createAdminClient();
});

afterAll(async () => {
  await pool.end();
});

async function seed(date: string, status: "scheduled" | "cancelled" = "scheduled", reason: string | null = null) {
  await pool.query(`DELETE FROM rsvps WHERE game_id IN (SELECT id FROM games WHERE game_date = $1)`, [date]);
  await pool.query(`DELETE FROM games WHERE game_date = $1`, [date]);
  const res = await pool.query(
    `INSERT INTO games (game_date, status, status_reason) VALUES ($1, $2, $3) RETURNING id`,
    [date, status, reason]
  );
  return res.rows[0].id as string;
}

async function cleanup(date: string) {
  await pool.query(`DELETE FROM rsvps WHERE game_id IN (SELECT id FROM games WHERE game_date = $1)`, [date]);
  await pool.query(`DELETE FROM games WHERE game_date = $1`, [date]);
}

async function seedPlayer(email: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user) throw error ?? new Error("user creation failed");
  return data.user.id;
}

async function seedRsvp(gameId: string, playerId: string, status: "in" | "out" | "maybe", guests = 0) {
  await pool.query(
    `INSERT INTO rsvps (game_id, player_id, status, guests) VALUES ($1, $2, $3, $4)
       ON CONFLICT (game_id, player_id) DO UPDATE SET status = EXCLUDED.status, guests = EXCLUDED.guests`,
    [gameId, playerId, status, guests]
  );
}

describe("getOgCounts", () => {
  it("returns no-game when no game row exists", async () => {
    const date = "2098-05-01";
    await cleanup(date);
    const result = await getOgCounts(admin, date);
    expect(result).toEqual({ state: "no-game" });
  });

  it("returns cancelled with the reason", async () => {
    const date = "2098-05-02";
    await seed(date, "cancelled", "Snow day");
    try {
      const result = await getOgCounts(admin, date);
      expect(result).toEqual({ state: "cancelled", reason: "Snow day" });
    } finally {
      await cleanup(date);
    }
  });

  it("returns cancelled with null reason when none is set", async () => {
    const date = "2098-05-03";
    await seed(date, "cancelled", null);
    try {
      const result = await getOgCounts(admin, date);
      expect(result).toEqual({ state: "cancelled", reason: null });
    } finally {
      await cleanup(date);
    }
  });

  it("counts in and maybe including guests, ignores out", async () => {
    const date = "2098-05-04";
    const gameId = await seed(date);
    const p1 = await seedPlayer("og-test-p1@example.com", "Alice");
    const p2 = await seedPlayer("og-test-p2@example.com", "Bob");
    const p3 = await seedPlayer("og-test-p3@example.com", "Cat");
    const p4 = await seedPlayer("og-test-p4@example.com", "Dan");
    try {
      await seedRsvp(gameId, p1, "in", 2);     // contributes 3 to in
      await seedRsvp(gameId, p2, "in", 0);     // contributes 1 to in
      await seedRsvp(gameId, p3, "maybe", 1);  // contributes 2 to maybe
      await seedRsvp(gameId, p4, "out", 5);    // contributes 0
      const result = await getOgCounts(admin, date);
      expect(result).toEqual({ state: "scheduled", in: 4, maybe: 2 });
    } finally {
      await cleanup(date);
      for (const id of [p1, p2, p3, p4]) await admin.auth.admin.deleteUser(id);
    }
  });

  it("returns zero counts for a scheduled game with no rsvps", async () => {
    const date = "2098-05-05";
    await seed(date);
    try {
      const result = await getOgCounts(admin, date);
      expect(result).toEqual({ state: "scheduled", in: 0, maybe: 0 });
    } finally {
      await cleanup(date);
    }
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx jest tests/unit/og-counts.test.ts`
Expected: FAIL — `Cannot find module '@/lib/og'`.

- [ ] **Step 3: Implement `lib/og.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type OgCardData =
  | { state: "no-game" }
  | { state: "cancelled"; reason: string | null }
  | { state: "scheduled"; in: number; maybe: number };

export async function getOgCounts(
  supabase: SupabaseClient,
  date: string
): Promise<OgCardData> {
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, status, status_reason")
    .eq("game_date", date)
    .maybeSingle();

  if (gameErr) throw gameErr;
  if (!game) return { state: "no-game" };
  if (game.status === "cancelled") {
    return { state: "cancelled", reason: game.status_reason ?? null };
  }

  const { data: rsvps, error: rsvpErr } = await supabase
    .from("rsvps")
    .select("status, guests")
    .eq("game_id", game.id);

  if (rsvpErr) throw rsvpErr;

  let inCount = 0;
  let maybeCount = 0;
  for (const r of rsvps ?? []) {
    const guests = r.guests ?? 0;
    if (r.status === "in") inCount += 1 + guests;
    else if (r.status === "maybe") maybeCount += 1 + guests;
  }

  return { state: "scheduled", in: inCount, maybe: maybeCount };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest tests/unit/og-counts.test.ts`
Expected: PASS, 5 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/og.ts tests/unit/og-counts.test.ts
git commit -m "Add getOgCounts helper for OG card data"
```

---

## Task 2: Request-free `getSiteOrigin`

**Files:**
- Modify: `lib/site-url.ts`
- Test: `tests/unit/site-url.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `tests/unit/site-url.test.ts`:

```ts
/** @jest-environment node */
import { getSiteOrigin } from "@/lib/site-url";

describe("getSiteOrigin", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns NEXT_PUBLIC_SITE_URL when set, stripping trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://oldmanhoops.example.com/";
    expect(getSiteOrigin()).toBe("https://oldmanhoops.example.com");
  });

  it("returns https://VERCEL_URL when NEXT_PUBLIC_SITE_URL is absent", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "oldmanhoops-git-main.vercel.app";
    expect(getSiteOrigin()).toBe("https://oldmanhoops-git-main.vercel.app");
  });

  it("returns null when neither env var is set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    expect(getSiteOrigin()).toBeNull();
  });

  it("prefers NEXT_PUBLIC_SITE_URL over VERCEL_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://oldmanhoops.example.com";
    process.env.VERCEL_URL = "should-be-ignored.vercel.app";
    expect(getSiteOrigin()).toBe("https://oldmanhoops.example.com");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest tests/unit/site-url.test.ts`
Expected: FAIL — `getSiteOrigin is not a function` or similar import error.

- [ ] **Step 3: Add `getSiteOrigin` to `lib/site-url.ts`**

The existing file is:

```ts
import { env } from "@/lib/env";

export function siteOrigin(request: Request): string {
  if (env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}
```

Replace it with:

```ts
import { env } from "@/lib/env";

export function siteOrigin(request: Request): string {
  if (env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}

// Request-free variant for places with no Request object (e.g., generateMetadata).
// Returns null if no origin can be resolved — callers should degrade gracefully.
export function getSiteOrigin(): string | null {
  if (env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/+$/, "")}`;
  }
  return null;
}
```

Note: `env.NEXT_PUBLIC_SITE_URL` is already read at module load. Because the test mutates `process.env` between cases, the `env` object won't reflect those mutations. The test therefore sets `process.env.NEXT_PUBLIC_SITE_URL` *before* this module is loaded fresh. Update the test to `jest.isolateModules` to ensure the module is re-imported per test. Replace the `import` line and each test body:

Replace `tests/unit/site-url.test.ts` with:

```ts
/** @jest-environment node */
describe("getSiteOrigin", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  function load(): () => string | null {
    let fn!: () => string | null;
    jest.isolateModules(() => {
      fn = require("@/lib/site-url").getSiteOrigin;
    });
    return fn;
  }

  it("returns NEXT_PUBLIC_SITE_URL when set, stripping trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://oldmanhoops.example.com/";
    expect(load()()).toBe("https://oldmanhoops.example.com");
  });

  it("returns https://VERCEL_URL when NEXT_PUBLIC_SITE_URL is absent", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = "oldmanhoops-git-main.vercel.app";
    expect(load()()).toBe("https://oldmanhoops-git-main.vercel.app");
  });

  it("returns null when neither env var is set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    expect(load()()).toBeNull();
  });

  it("prefers NEXT_PUBLIC_SITE_URL over VERCEL_URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://oldmanhoops.example.com";
    process.env.VERCEL_URL = "should-be-ignored.vercel.app";
    expect(load()()).toBe("https://oldmanhoops.example.com");
  });
});
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest tests/unit/site-url.test.ts`
Expected: PASS, 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/site-url.ts tests/unit/site-url.test.ts
git commit -m "Add request-free getSiteOrigin for metadata use"
```

---

## Task 3: OG route `app/og/[date]/route.tsx`

**Files:**
- Create: `app/og/[date]/route.tsx`
- Test: `tests/unit/og-route.test.ts`

- [ ] **Step 1: Write the failing route test file**

Create `tests/unit/og-route.test.ts`:

```ts
/** @jest-environment node */
import { Pool } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "@/app/og/[date]/route";

const CONN = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

let pool: Pool;

beforeAll(() => {
  pool = new Pool({ connectionString: CONN });
});

afterAll(async () => {
  await pool.end();
});

async function seedGame(date: string, status: "scheduled" | "cancelled" = "scheduled", reason: string | null = null) {
  await pool.query(`DELETE FROM rsvps WHERE game_id IN (SELECT id FROM games WHERE game_date = $1)`, [date]);
  await pool.query(`DELETE FROM games WHERE game_date = $1`, [date]);
  await pool.query(
    `INSERT INTO games (game_date, status, status_reason) VALUES ($1, $2, $3)`,
    [date, status, reason]
  );
}

async function cleanupGame(date: string) {
  await pool.query(`DELETE FROM rsvps WHERE game_id IN (SELECT id FROM games WHERE game_date = $1)`, [date]);
  await pool.query(`DELETE FROM games WHERE game_date = $1`, [date]);
}

function call(date: string) {
  const req = new Request(`http://localhost/og/${date}`);
  return GET(req, { params: Promise.resolve({ date }) });
}

describe("GET /og/[date]", () => {
  it("returns 400 for a non-date segment", async () => {
    const res = await call("not-a-date");
    expect(res.status).toBe(400);
  });

  it("returns 400 for a mis-formatted date", async () => {
    const res = await call("2026-4-1");
    expect(res.status).toBe(400);
  });

  it("returns a PNG image for a scheduled day", async () => {
    const date = "2097-06-01";
    await seedGame(date, "scheduled");
    try {
      const res = await call(date);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/image\/png/);
    } finally {
      await cleanupGame(date);
    }
  });

  it("returns a PNG image for a no-game day", async () => {
    const date = "2097-06-02";
    await cleanupGame(date);
    const res = await call(date);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/png/);
  });

  it("returns a PNG image for a cancelled day", async () => {
    const date = "2097-06-03";
    await seedGame(date, "cancelled", "Gym booked");
    try {
      const res = await call(date);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/image\/png/);
    } finally {
      await cleanupGame(date);
    }
  });

  it("sets cache headers", async () => {
    const date = "2097-06-04";
    await seedGame(date, "scheduled");
    try {
      const res = await call(date);
      const cc = res.headers.get("cache-control") ?? "";
      expect(cc).toMatch(/s-maxage=60/);
      expect(cc).toMatch(/stale-while-revalidate=300/);
    } finally {
      await cleanupGame(date);
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest tests/unit/og-route.test.ts`
Expected: FAIL — `Cannot find module '@/app/og/[date]/route'`.

- [ ] **Step 3: Implement the route**

Create `app/og/[date]/route.tsx`:

```tsx
import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { DateTime } from "luxon";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { getOgCounts, type OgCardData } from "@/lib/og";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const logoDataUrl = (() => {
  const svg = readFileSync(path.join(process.cwd(), "public", "omh.svg"), "utf8");
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
})();

const NAVY = "#1f438b";
const RED = "#c9102e";
const BG = "#fafaf9";
const BORDER = "#e5e7eb";
const MUTED = "#374151";

function formatDateMDY(date: string): string {
  const dt = DateTime.fromFormat(date, "yyyy-MM-dd", { zone: env.APP_TIMEZONE });
  return dt.toFormat("MM/dd/yyyy");
}

function card(date: string, data: OgCardData) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: BG,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#111827",
      }}
    >
      <div
        style={{
          width: 380,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 48px",
          gap: 22,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoDataUrl} width={220} alt="" style={{ display: "block" }} />
        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            color: NAVY,
            letterSpacing: 1,
          }}
        >
          {formatDateMDY(date)}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          borderLeft: `1px solid ${BORDER}`,
          padding: "52px 64px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 900,
            color: NAVY,
            letterSpacing: 0.3,
            marginBottom: 18,
          }}
        >
          Old Man Hoops
        </div>

        {data.state === "scheduled" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
              <div
                style={{
                  fontSize: 200,
                  fontWeight: 900,
                  color: NAVY,
                  letterSpacing: -6,
                  lineHeight: 0.82,
                }}
              >
                {data.in}
              </div>
              <div
                style={{
                  fontSize: 62,
                  fontWeight: 800,
                  color: NAVY,
                  letterSpacing: 3,
                }}
              >
                IN
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
              <div
                style={{
                  fontSize: 150,
                  fontWeight: 900,
                  color: RED,
                  letterSpacing: -4.5,
                  lineHeight: 0.82,
                }}
              >
                {data.maybe}
              </div>
              <div
                style={{
                  fontSize: 46,
                  fontWeight: 800,
                  color: RED,
                  letterSpacing: 3,
                }}
              >
                MAYBE
              </div>
            </div>
          </div>
        ) : data.state === "cancelled" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                fontSize: 140,
                fontWeight: 900,
                color: RED,
                letterSpacing: -4,
                lineHeight: 0.9,
              }}
            >
              Cancelled
            </div>
            {data.reason ? (
              <div
                style={{
                  fontSize: 28,
                  color: MUTED,
                  maxWidth: 620,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {data.reason}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: MUTED,
            }}
          >
            No game today
          </div>
        )}
      </div>
    </div>
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ date: string }> }
): Promise<Response> {
  const { date } = await ctx.params;
  if (!DATE_RE.test(date)) {
    return new Response("invalid date", { status: 400 });
  }

  const supabase = createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const data = await getOgCounts(supabase, date);

  const img = new ImageResponse(card(date, data), {
    width: 1200,
    height: 630,
  });

  const headers = new Headers(img.headers);
  headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return new Response(img.body, { status: img.status, headers });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest tests/unit/og-route.test.ts`
Expected: PASS, 6 passing. If `ImageResponse` is slow to initialize, the first test may take a few seconds.

- [ ] **Step 5: Commit**

```bash
git add app/og/[date]/route.tsx tests/unit/og-route.test.ts
git commit -m "Add /og/[date] route rendering daily OG card"
```

---

## Task 4: Wire `generateMetadata` on the home page

**Files:**
- Modify: `app/page.tsx`
- Test: `tests/unit/page-metadata.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `tests/unit/page-metadata.test.ts`:

```ts
/** @jest-environment node */
import type { Metadata } from "next";

describe("home page generateMetadata", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  async function load(): Promise<() => Promise<Metadata>> {
    let fn!: () => Promise<Metadata>;
    await jest.isolateModulesAsync(async () => {
      fn = (await import("@/app/page")).generateMetadata;
    });
    return fn;
  }

  it("includes today's og image when site origin is known", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://oldmanhoops.example.com";
    const gen = await load();
    const md = await gen();
    const images = md.openGraph?.images;
    expect(Array.isArray(images)).toBe(true);
    const first = Array.isArray(images) ? images[0] : images;
    const url = typeof first === "object" && first && "url" in first ? first.url : first;
    expect(String(url)).toMatch(/^https:\/\/oldmanhoops\.example\.com\/og\/\d{4}-\d{2}-\d{2}$/);
    expect(md.twitter?.card).toBe("summary_large_image");
  });

  it("omits og image when site origin cannot be resolved", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    const gen = await load();
    const md = await gen();
    expect(md.openGraph?.images).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest tests/unit/page-metadata.test.ts`
Expected: FAIL — `generateMetadata is not a function` (it doesn't exist yet).

- [ ] **Step 3: Add `generateMetadata` to `app/page.tsx`**

The current `app/page.tsx` starts with:

```tsx
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { formatGameDate, getToday } from "@/lib/date";
import { getTodayScoreboard } from "@/lib/scoreboard";
import { Scoreboard } from "@/app/_components/Scoreboard";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // ...
}
```

Add these imports and exported `generateMetadata` above the `Home` component (below the existing imports and `dynamic` line):

```tsx
import type { Metadata } from "next";
import { getSiteOrigin } from "@/lib/site-url";
```

Then add the new export immediately after the existing `export const dynamic = "force-dynamic";` line and before `export default async function Home`:

```tsx
export async function generateMetadata(): Promise<Metadata> {
  const today = getToday();
  const origin = getSiteOrigin();

  const base: Metadata = {
    title: "Old Man Hoops",
    description: "Daily pickup basketball RSVP",
  };

  if (!origin) return base;

  const ogUrl = `${origin}/og/${today}`;
  return {
    ...base,
    openGraph: {
      title: "Old Man Hoops",
      description: "Daily pickup basketball RSVP",
      images: [{ url: ogUrl, width: 1200, height: 630, alt: "Old Man Hoops — today's RSVP counts" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Old Man Hoops",
      description: "Daily pickup basketball RSVP",
      images: [ogUrl],
    },
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest tests/unit/page-metadata.test.ts`
Expected: PASS, 2 passing.

- [ ] **Step 5: Re-run the full unit test suite to confirm nothing regressed**

Run: `npx jest`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx tests/unit/page-metadata.test.ts
git commit -m "Wire daily OG image into home page metadata"
```

---

## Task 5: Manual verification

**Files:** none

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Wait for `Ready on http://localhost:3000`.

- [ ] **Step 2: Fetch today's OG image directly and confirm it is a PNG**

In a second terminal, run:

```bash
TODAY=$(TZ=America/Chicago date +%Y-%m-%d)
curl -sI "http://devbox:3000/og/${TODAY}" | head -5
curl -s "http://devbox:3000/og/${TODAY}" -o /tmp/og.png
file /tmp/og.png
```

Expected: HTTP/1.1 200 OK, `Content-Type: image/png`, and `file` reports `PNG image data, 1200 x 630`.

- [ ] **Step 3: Visually inspect the image**

Open `/tmp/og.png` in an image viewer (or `xdg-open /tmp/og.png`). Confirm:
- Logo on the left, date in MM/DD/YYYY below it.
- "Old Man Hoops" heading on the right.
- IN count in navy, MAYBE count (smaller, red) below it — or the "No game today" / "Cancelled" fallback if applicable today.

- [ ] **Step 4: Confirm the home page emits `og:image`**

Run:

```bash
curl -s http://devbox:3000/ | grep -i 'og:image'
```

Expected: `<meta property="og:image" content="…/og/YYYY-MM-DD"/>` with today's date, plus `og:image:width`, `og:image:height` entries.

- [ ] **Step 5: Test invalid date returns 400**

Run:

```bash
curl -sI "http://devbox:3000/og/bogus" | head -1
```

Expected: `HTTP/1.1 400 Bad Request`.

- [ ] **Step 6: (Post-deploy) Paste the production URL into Slack and confirm the preview card shows the expected counts.**

No automated check for this — it's the final smoke test once the change is in production.

---

## Self-Review Notes

- **Spec coverage:** route (Task 3), data helper (Task 1), metadata wiring (Task 4), site-origin helper (Task 2), three display states exercised in Task 3 tests, cache headers asserted in Task 3, manual share test is Task 5 step 6.
- **Placeholders:** none — every code step shows full code.
- **Type consistency:** `OgCardData` is defined in Task 1 and consumed in Task 3 with matching discriminants (`state: "no-game" | "cancelled" | "scheduled"`) and fields (`in`, `maybe`, `reason`).
- **Testing pattern match:** tests use the same local-Supabase integration pattern as `tests/unit/scoreboard.test.ts` — `pg.Pool` for seed/cleanup, admin client for the supabase interface, `afterAll` closes the pool. Consistent with `maxWorkers: 1`.
- **Font caveat:** `ImageResponse` uses its built-in font (no `fonts:` option passed). Weights 800/900 render at the closest available weight. If the rendered numbers look too thin in Task 5 visual check, a follow-up task would load Inter weights via `fetch()` or a local TTF in `assets/fonts/` — but don't add complexity up front.
