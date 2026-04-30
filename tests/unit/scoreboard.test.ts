/** @jest-environment node */
import { Pool } from "pg";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getScoreboard } from "@/lib/scoreboard";

function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

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

describe("getScoreboard", () => {
  it("returns state 'no-game' when no game row exists for today", async () => {
    const date = "2099-04-01";
    await cleanup(date);
    const result = await getScoreboard(admin, { date, includeRoster: false });
    expect(result).toEqual({ state: "no-game" });
  });

  it("returns state 'cancelled' with the reason", async () => {
    const date = "2099-04-02";
    await seed(date, "cancelled", "Gym closed");
    try {
      const result = await getScoreboard(admin, { date, includeRoster: false });
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
      const result = await getScoreboard(admin, { date, includeRoster: false });
      expect(result.state).toBe("scheduled");
      if (result.state === "scheduled") {
        expect(result.counts).toEqual({ in: 3, out: 1, maybe: 2 });
        expect(result.roster).toBeNull();
        expect(result.currentUserRsvp).toBeNull();
      }
    } finally {
      await cleanup(date);
      for (const id of [p1, p2, p3]) await admin.auth.admin.deleteUser(id);
    }
  });

  it("returns counts for anon (logged-out) callers — RLS on players must not zero them out", async () => {
    const date = "2099-04-09";
    const gameId = await seed(date);
    const p1 = await seedPlayer("sb-test-anon-p1@example.com", "Alice");
    const p2 = await seedPlayer("sb-test-anon-p2@example.com", "Bob");
    try {
      await seedRsvp(gameId, p1, "in", 2);
      await seedRsvp(gameId, p2, "out");
      const anon = createAnonClient();
      const result = await getScoreboard(anon, { date, includeRoster: false });
      expect(result.state).toBe("scheduled");
      if (result.state === "scheduled") {
        expect(result.counts).toEqual({ in: 3, out: 1, maybe: 0 });
      }
    } finally {
      await cleanup(date);
      for (const id of [p1, p2]) await admin.auth.admin.deleteUser(id);
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
      const result = await getScoreboard(admin, { date, includeRoster: true });
      expect(result.state).toBe("scheduled");
      if (result.state === "scheduled" && result.roster) {
        expect(result.roster).toHaveLength(2);
        expect(result.roster).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "Alice", status: "in", guests: 1, note: "bringing a friend" }),
            expect.objectContaining({ name: "Bob", status: "out", guests: 0, note: null }),
          ])
        );
        expect(result.currentUserRsvp).toBeNull();
      }
    } finally {
      await cleanup(date);
      for (const id of [p1, p2]) await admin.auth.admin.deleteUser(id);
    }
  });

  it("populates currentUserRsvp when userId is provided and they have an RSVP", async () => {
    const date = "2099-04-05";
    const gameId = await seed(date);
    const p1 = await seedPlayer("sb-test-cur1@example.com", "Alice");
    try {
      await seedRsvp(gameId, p1, "in", 1, "running late");
      const result = await getScoreboard(admin, { date, includeRoster: true, userId: p1 });
      expect(result.state).toBe("scheduled");
      if (result.state === "scheduled") {
        expect(result.currentUserRsvp).toEqual({ status: "in", guests: 1, note: "running late" });
      }
    } finally {
      await cleanup(date);
      await admin.auth.admin.deleteUser(p1);
    }
  });

  it("returns currentUserRsvp null when user has not RSVP'd yet", async () => {
    const date = "2099-04-06";
    const gameId = await seed(date);
    const p1 = await seedPlayer("sb-test-cur2@example.com", "Bob");
    try {
      await seedRsvp(gameId, p1, "in"); // seed one so rsvps query returns rows (but not for our user)
      const p2 = await seedPlayer("sb-test-cur3@example.com", "Cat");
      try {
        const result = await getScoreboard(admin, { date, includeRoster: true, userId: p2 });
        expect(result.state).toBe("scheduled");
        if (result.state === "scheduled") {
          expect(result.currentUserRsvp).toBeNull();
        }
      } finally {
        await admin.auth.admin.deleteUser(p2);
      }
    } finally {
      await cleanup(date);
      await admin.auth.admin.deleteUser(p1);
    }
  });

  it("returns currentUserRsvp null when userId is not provided", async () => {
    const date = "2099-04-07";
    const gameId = await seed(date);
    const p1 = await seedPlayer("sb-test-cur4@example.com", "Dave");
    try {
      await seedRsvp(gameId, p1, "maybe");
      const result = await getScoreboard(admin, { date, includeRoster: false });
      expect(result.state).toBe("scheduled");
      if (result.state === "scheduled") {
        expect(result.currentUserRsvp).toBeNull();
      }
    } finally {
      await cleanup(date);
      await admin.auth.admin.deleteUser(p1);
    }
  });

  it("includes playerId on roster entries", async () => {
    const date = "2099-04-08";
    const gameId = await seed(date);
    const p1 = await seedPlayer("sb-test-pid@example.com", "PidPlayer");
    try {
      await seedRsvp(gameId, p1, "in");
      const result = await getScoreboard(admin, { date, includeRoster: true });
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

  it("returns nonResponders = null when includeNonResponders is false", async () => {
    const date = "2099-05-01";
    const gameId = await seed(date);
    const p1 = await seedPlayer("sb-test-nr1@example.com", "Alice");
    try {
      await seedRsvp(gameId, p1, "in");
      const result = await getScoreboard(admin, { date, includeRoster: true });
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
      const result = await getScoreboard(admin, {
        date,
        includeRoster: true,
        includeNonResponders: true,
      });
      expect(result.state).toBe("scheduled");
      if (result.state !== "scheduled") return;
      expect(result.nonResponders).not.toBeNull();
      const ids = (result.nonResponders ?? []).map((n) => n.playerId);
      expect(ids).toContain(nonResponder);
      expect(ids).not.toContain(responder);
      const noEntry = (result.nonResponders ?? []).find((n) => n.playerId === nonResponder);
      expect(noEntry?.name).toBe("No");
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
      const result = await getScoreboard(admin, {
        date,
        includeRoster: true,
        includeNonResponders: true,
      });
      expect(result.state).toBe("scheduled");
      if (result.state !== "scheduled") return;
      expect(result.nonResponders).not.toBeNull();
      const ids = (result.nonResponders ?? []).map((n) => n.playerId);
      expect(ids).not.toContain(inactive);
    } finally {
      await cleanup(date);
      for (const id of [responder, inactive]) await admin.auth.admin.deleteUser(id);
    }
  });
});
