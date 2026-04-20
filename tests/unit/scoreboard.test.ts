/** @jest-environment node */
import { Pool } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTodayScoreboard } from "@/lib/scoreboard";

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

async function seedRsvp(gameId: string, playerId: string, status: "in" | "out" | "maybe", guests = 0, note: string | null = null) {
  await pool.query(
    `INSERT INTO rsvps (game_id, player_id, status, guests, note) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (game_id, player_id) DO UPDATE SET status = EXCLUDED.status, guests = EXCLUDED.guests, note = EXCLUDED.note`,
    [gameId, playerId, status, guests, note]
  );
}

describe("getTodayScoreboard", () => {
  it("returns state 'no-game' when no game row exists for today", async () => {
    const date = "2099-04-01";
    await cleanup(date);
    const result = await getTodayScoreboard(admin, { today: date, includeRoster: false });
    expect(result).toEqual({ state: "no-game" });
  });

  it("returns state 'cancelled' with the reason", async () => {
    const date = "2099-04-02";
    await seed(date, "cancelled", "Gym closed");
    try {
      const result = await getTodayScoreboard(admin, { today: date, includeRoster: false });
      expect(result).toEqual({ state: "cancelled", reason: "Gym closed" });
    } finally {
      await cleanup(date);
    }
  });

  it("returns counts including guests for in and maybe, player-only for out", async () => {
    const date = "2099-04-03";
    const gameId = await seed(date);
    const p1 = await seedPlayer("sb-test-p1@example.com", "Alice");
    const p2 = await seedPlayer("sb-test-p2@example.com", "Bob");
    const p3 = await seedPlayer("sb-test-p3@example.com", "Cat");
    try {
      await seedRsvp(gameId, p1, "in", 2);      // 1 + 2 = 3 bodies in
      await seedRsvp(gameId, p2, "maybe", 1);   // 1 + 1 = 2 bodies maybe
      await seedRsvp(gameId, p3, "out", 5);     // 1 player out (guests ignored)
      const result = await getTodayScoreboard(admin, { today: date, includeRoster: false });
      expect(result.state).toBe("scheduled");
      if (result.state === "scheduled") {
        expect(result.counts).toEqual({ in: 3, out: 1, maybe: 2 });
        expect(result.roster).toBeNull();
      }
    } finally {
      await cleanup(date);
      for (const id of [p1, p2, p3]) await admin.auth.admin.deleteUser(id);
    }
  });

  it("includes roster entries when includeRoster is true", async () => {
    const date = "2099-04-04";
    const gameId = await seed(date);
    const p1 = await seedPlayer("sb-test-r1@example.com", "Alice");
    const p2 = await seedPlayer("sb-test-r2@example.com", "Bob");
    try {
      await seedRsvp(gameId, p1, "in", 1, "bringing a friend");
      await seedRsvp(gameId, p2, "out");
      const result = await getTodayScoreboard(admin, { today: date, includeRoster: true });
      expect(result.state).toBe("scheduled");
      if (result.state === "scheduled" && result.roster) {
        expect(result.roster).toHaveLength(2);
        expect(result.roster).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "Alice", status: "in", guests: 1, note: "bringing a friend" }),
            expect.objectContaining({ name: "Bob", status: "out", guests: 0, note: null }),
          ])
        );
      }
    } finally {
      await cleanup(date);
      for (const id of [p1, p2]) await admin.auth.admin.deleteUser(id);
    }
  });
});
