/**
 * @jest-environment node
 */
import { Pool } from "pg";

const CONN = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

let pool: Pool;

beforeAll(() => {
  pool = new Pool({ connectionString: CONN });
});

afterAll(async () => {
  await pool.end();
});

async function query<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
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
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
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
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("enables RLS on all three tables", async () => {
    const rows = await query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname IN ('players', 'games', 'rsvps')`
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it("has expected RLS policies", async () => {
    const rows = await query<{ tablename: string; policyname: string; cmd: string }>(
      `SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname = 'public'`
    );
    const byTable: Record<string, string[]> = {};
    for (const r of rows) {
      (byTable[r.tablename] ??= []).push(`${r.cmd}:${r.policyname}`);
    }
    expect(byTable.players?.sort()).toEqual([
      "DELETE:players_delete_own",
      "SELECT:players_select_authenticated",
      "UPDATE:players_update_own",
    ]);
    expect(byTable.games?.sort()).toEqual(["SELECT:games_select_anyone"]);
    expect(byTable.rsvps?.sort()).toEqual([
      "DELETE:rsvps_delete_own",
      "INSERT:rsvps_insert_own",
      "SELECT:rsvps_select_anyone",
      "UPDATE:rsvps_update_own",
    ]);
  });

  it("auto-creates a players row when an auth user is inserted", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
           VALUES (gen_random_uuid(), 'trigger-test@example.com', '', now(), 'authenticated', 'authenticated', '{"name":"Trigger Test"}'::jsonb)
           RETURNING id`
      );
      const userId = res.rows[0].id;
      const playerRes = await client.query(
        `SELECT name FROM public.players WHERE id = $1`,
        [userId]
      );
      expect(playerRes.rows).toHaveLength(1);
      expect(playerRes.rows[0].name).toBe("Trigger Test");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("defaults players.name to empty string when raw_user_meta_data is null", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
           VALUES (gen_random_uuid(), 'null-meta@example.com', '', now(), 'authenticated', 'authenticated')
           RETURNING id`
      );
      const userId = res.rows[0].id;
      const playerRes = await client.query(
        `SELECT name FROM public.players WHERE id = $1`,
        [userId]
      );
      expect(playerRes.rows).toHaveLength(1);
      expect(playerRes.rows[0].name).toBe("");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("defaults players.name to empty string when raw_user_meta_data lacks a name key", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
           VALUES (gen_random_uuid(), 'no-name-key@example.com', '', now(), 'authenticated', 'authenticated', '{}'::jsonb)
           RETURNING id`
      );
      const userId = res.rows[0].id;
      const playerRes = await client.query(
        `SELECT name FROM public.players WHERE id = $1`,
        [userId]
      );
      expect(playerRes.rows).toHaveLength(1);
      expect(playerRes.rows[0].name).toBe("");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("copies phone from raw_user_meta_data when present", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
           VALUES (gen_random_uuid(), 'phone-trigger@example.com', '', now(), 'authenticated', 'authenticated',
                   '{"name":"P","phone":"5551234567"}'::jsonb)
           RETURNING id`
      );
      const userId = res.rows[0].id;
      const playerRes = await client.query(
        `SELECT phone FROM public.players WHERE id = $1`,
        [userId]
      );
      expect(playerRes.rows[0].phone).toBe("5551234567");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("leaves phone null when raw_user_meta_data lacks phone key", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
           VALUES (gen_random_uuid(), 'no-phone@example.com', '', now(), 'authenticated', 'authenticated',
                   '{"name":"X"}'::jsonb)
           RETURNING id`
      );
      const userId = res.rows[0].id;
      const playerRes = await client.query(
        `SELECT phone FROM public.players WHERE id = $1`,
        [userId]
      );
      expect(playerRes.rows[0].phone).toBeNull();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("leaves phone null when raw_user_meta_data.phone is empty string", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
           VALUES (gen_random_uuid(), 'empty-phone@example.com', '', now(), 'authenticated', 'authenticated',
                   '{"name":"X","phone":""}'::jsonb)
           RETURNING id`
      );
      const userId = res.rows[0].id;
      const playerRes = await client.query(
        `SELECT phone FROM public.players WHERE id = $1`,
        [userId]
      );
      expect(playerRes.rows[0].phone).toBeNull();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
