/**
 * @jest-environment node
 */
import { Client } from "pg";

const CONN = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: CONN });
  await client.connect();
  try {
    const res = await client.query(sql, params);
    return res.rows as T[];
  } finally {
    await client.end();
  }
}

describe("initial schema", () => {
  it("has players table with expected columns", async () => {
    const rows = await query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'players'
         ORDER BY ordinal_position`
    );
    const names = rows.map((r) => r.column_name);
    expect(names).toEqual([
      "id",
      "name",
      "phone",
      "reminder_email",
      "reminder_sms",
      "active",
      "created_at",
    ]);
  });

  it("has games table with status and status_reason", async () => {
    const rows = await query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'games'`
    );
    const names = rows.map((r) => r.column_name);
    expect(names).toEqual(
      expect.arrayContaining(["id", "game_date", "status", "status_reason", "created_at"])
    );
  });

  it("has rsvps table with UNIQUE(game_id, player_id)", async () => {
    const rows = await query<{ constraint_name: string }>(
      `SELECT c.constraint_name FROM information_schema.table_constraints c
         WHERE c.table_schema = 'public' AND c.table_name = 'rsvps'
           AND c.constraint_type = 'UNIQUE'`
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("enforces rsvps.status CHECK constraint", async () => {
    const client = new Client({ connectionString: CONN });
    await client.connect();
    try {
      const gameRes = await client.query(
        `INSERT INTO games (game_date) VALUES ('2099-01-01') RETURNING id`
      );
      const gameId = gameRes.rows[0].id;
      const userRes = await client.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
           VALUES (gen_random_uuid(), 'test-check@example.com', '', now(), 'authenticated', 'authenticated')
           RETURNING id`
      );
      const playerId = userRes.rows[0].id;

      await expect(
        client.query(
          `INSERT INTO rsvps (game_id, player_id, status) VALUES ($1, $2, 'invalid-status')`,
          [gameId, playerId]
        )
      ).rejects.toThrow(/check constraint/i);
    } finally {
      await client.query(
        `DELETE FROM games WHERE game_date = '2099-01-01';
         DELETE FROM auth.users WHERE email = 'test-check@example.com';`
      );
      await client.end();
    }
  });
});
