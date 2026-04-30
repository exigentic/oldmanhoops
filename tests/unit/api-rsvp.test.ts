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
      // Patch only getUser on the real auth object, preserving all other auth methods
      // (spread loses both prototype methods on the client and methods like getSession on auth)
      (realAdmin.auth as unknown as Record<string, unknown>).getUser = getUserMock;
      return realAdmin;
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
