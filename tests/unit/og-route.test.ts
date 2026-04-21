/** @jest-environment node */
import { Pool } from "pg";
import { GET } from "@/app/og/[date]/route";

// `var` is hoisted above the jest.mock factory (which jest also hoists), so
// the factory can close over it safely. `let`/`const` would not work here.
// eslint-disable-next-line no-var
var mockGetOgCounts: jest.Mock;

jest.mock("@/lib/og", () => {
  const real = jest.requireActual<typeof import("@/lib/og")>("@/lib/og");
  // Build the jest.fn with the real implementation as the default.
  const fn: jest.Mock = jest.fn((...args: Parameters<typeof real.getOgCounts>) =>
    real.getOgCounts(...args)
  );
  // Assign into the hoisted var so tests can reach it.
  mockGetOgCounts = fn;
  return { ...real, getOgCounts: fn };
});

const CONN = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

let pool: Pool;

beforeAll(() => {
  pool = new Pool({ connectionString: CONN });
});

afterAll(async () => {
  await pool.end();
});

afterEach(() => {
  // Restore the real-implementation default after any test that overrides it.
  const real = jest.requireActual<typeof import("@/lib/og")>("@/lib/og");
  mockGetOgCounts.mockImplementation(
    (...args: Parameters<typeof real.getOgCounts>) => real.getOgCounts(...args)
  );
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

  it("returns 500 when getOgCounts throws", async () => {
    mockGetOgCounts.mockRejectedValueOnce(new Error("boom"));
    const res = await call("2097-06-05");
    expect(res.status).toBe(500);
  });
});
