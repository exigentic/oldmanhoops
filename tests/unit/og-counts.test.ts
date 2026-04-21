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
