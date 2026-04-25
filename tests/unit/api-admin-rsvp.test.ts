/** @jest-environment node */
const getUserMock = jest.fn();
const isCurrentUserAdminMock = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

jest.mock("@/lib/auth/admin", () => ({
  isCurrentUserAdmin: (...args: unknown[]) => isCurrentUserAdminMock(...args),
}));

import { Pool } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "@/app/api/admin/rsvp/route";
import { getToday } from "@/lib/date";

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
  getUserMock.mockResolvedValueOnce({
    data: { user: userId ? { id: userId } : null },
    error: null,
  });
}

function mockIsAdmin(value: boolean) {
  isCurrentUserAdminMock.mockResolvedValueOnce(value);
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

beforeEach(() => {
  getUserMock.mockReset();
  isCurrentUserAdminMock.mockReset();
});

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

  it("returns 400 for invalid JSON body", async () => {
    mockSession("user-1");
    mockIsAdmin(true);
    const res = await POST(
      new Request("http://localhost/api/admin/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when no game exists today", async () => {
    mockSession("user-1");
    mockIsAdmin(true);
    const today = getToday();
    await pool.query(`DELETE FROM rsvps WHERE game_id IN (SELECT id FROM games WHERE game_date = $1)`, [today]);
    await pool.query(`DELETE FROM games WHERE game_date = $1`, [today]);
    const res = await POST(
      makeRequest({ player_id: "00000000-0000-0000-0000-000000000000", status: "in" })
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 when today's game is cancelled", async () => {
    mockSession("user-1");
    mockIsAdmin(true);
    const today = getToday();
    await pool.query(`DELETE FROM rsvps WHERE game_id IN (SELECT id FROM games WHERE game_date = $1)`, [today]);
    await pool.query(`DELETE FROM games WHERE game_date = $1`, [today]);
    await pool.query(`INSERT INTO games (game_date, status) VALUES ($1, 'cancelled')`, [today]);
    try {
      const res = await POST(
        makeRequest({ player_id: "00000000-0000-0000-0000-000000000000", status: "in" })
      );
      expect(res.status).toBe(403);
    } finally {
      await pool.query(`DELETE FROM games WHERE game_date = $1`, [today]);
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
