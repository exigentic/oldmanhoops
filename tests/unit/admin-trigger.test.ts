/** @jest-environment node */
import { Pool } from "pg";

const CONN =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

let pool: Pool;

beforeAll(() => {
  pool = new Pool({ connectionString: CONN });
});

afterAll(async () => {
  await pool.end();
});

// Postgres SET LOCAL doesn't accept parameter binding ($1), so JWT claims
// are interpolated as a quoted SQL literal with single-quote escaping.
function setJwtClaims(playerId: string): string {
  const json = JSON.stringify({ sub: playerId, role: "authenticated" }).replace(/'/g, "''");
  return `SET LOCAL "request.jwt.claims" = '${json}'`;
}

describe("players.is_admin write protection trigger", () => {
  it("blocks an authenticated user from setting is_admin = true on their own row", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const playerId = (
        await client.query(
          `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
             VALUES (gen_random_uuid(), 'self-promote@example.com', '', now(), 'authenticated', 'authenticated', '{"name":"X"}'::jsonb)
             RETURNING id`
        )
      ).rows[0].id;
      await client.query(`SET LOCAL ROLE authenticated`);
      await client.query(setJwtClaims(playerId));
      await expect(
        client.query(`UPDATE public.players SET is_admin = true WHERE id = $1`, [playerId])
      ).rejects.toThrow(/is_admin/);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("allows an authenticated user to update non-is_admin columns on their own row", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const playerId = (
        await client.query(
          `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
             VALUES (gen_random_uuid(), 'name-update@example.com', '', now(), 'authenticated', 'authenticated', '{"name":"X"}'::jsonb)
             RETURNING id`
        )
      ).rows[0].id;
      await client.query(`SET LOCAL ROLE authenticated`);
      await client.query(setJwtClaims(playerId));
      const res = await client.query(
        `UPDATE public.players SET name = 'Renamed' WHERE id = $1 RETURNING name`,
        [playerId]
      );
      expect(res.rows[0].name).toBe("Renamed");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("allows the service role to set is_admin = true", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const playerId = (
        await client.query(
          `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
             VALUES (gen_random_uuid(), 'service-promote@example.com', '', now(), 'authenticated', 'authenticated', '{"name":"X"}'::jsonb)
             RETURNING id`
        )
      ).rows[0].id;
      await client.query(`SET LOCAL ROLE service_role`);
      const res = await client.query(
        `UPDATE public.players SET is_admin = true WHERE id = $1 RETURNING is_admin`,
        [playerId]
      );
      expect(res.rows[0].is_admin).toBe(true);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("allows a direct DB session (no JWT, no role switch) to set is_admin", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const playerId = (
        await client.query(
          `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
             VALUES (gen_random_uuid(), 'bootstrap-promote@example.com', '', now(), 'authenticated', 'authenticated', '{"name":"X"}'::jsonb)
             RETURNING id`
        )
      ).rows[0].id;
      const res = await client.query(
        `UPDATE public.players SET is_admin = true WHERE id = $1 RETURNING is_admin`,
        [playerId]
      );
      expect(res.rows[0].is_admin).toBe(true);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
