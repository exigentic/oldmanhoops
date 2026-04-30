import { test, expect } from "./fixtures";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const PAST_DATE = "2025-01-15";

async function seedPastGame() {
  const admin = adminClient();
  // Upsert the game row (idempotent). Both parallel workers call this; the
  // second upsert is a no-op. We intentionally do NOT delete RSVPs here —
  // individual tests clean up their own RSVPs via user-deletion CASCADE, so
  // there is nothing to prune before the first test.
  await admin
    .from("games")
    .upsert({ game_date: PAST_DATE, status: "scheduled" }, { onConflict: "game_date" });
}

// afterAll intentionally does nothing. Per-test RSVP rows are owned by the
// e2e users created by each test; those users are deleted in fixture/finally
// teardown which cascades to their RSVPs. Deleting the shared game row (or
// ALL RSVPs for the game) in afterAll races with the other Playwright project
// (chromium/mobile) still running its tests and would cause failures there.
// The game row for PAST_DATE (a historical date) is harmless to leave in the
// local DB.

test.beforeAll(async () => {
  await seedPastGame();
});

test("anon visitor sees count cards on a past date", async ({ page }) => {
  await page.goto(`/d/${PAST_DATE}`);
  await expect(page.getByLabel(/In count/i)).toBeVisible();
  await expect(page.getByLabel(/Maybe count/i)).toBeVisible();
  await expect(page.getByLabel(/Out count/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^In$/, level: 2 })).toHaveCount(0);
});

test("member sees roster but no RSVP controls on a past date", async ({ page, authedUser }) => {
  const admin = adminClient();
  const { data: gameRow } = await admin
    .from("games")
    .select("id")
    .eq("game_date", PAST_DATE)
    .maybeSingle();
  await admin.from("rsvps").upsert(
    { game_id: gameRow!.id, player_id: authedUser.userId, status: "in", guests: 0, note: null },
    { onConflict: "game_id,player_id" }
  );

  await page.goto(`/d/${PAST_DATE}`);
  await expect(page.getByRole("heading", { name: /^In$/, level: 2 })).toBeVisible();
  await expect(page.getByRole("group", { name: /Your RSVP status/i })).toHaveCount(0);
});

test("admin can edit RSVP on a past date", async ({ page, authedUser }) => {
  const admin = adminClient();
  await admin.from("players").update({ is_admin: true }).eq("id", authedUser.userId);

  const targetSuffix = Date.now();
  const targetEmail = `e2e-target-${targetSuffix}@example.com`;
  const targetName = `Target Player ${targetSuffix}`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: targetEmail,
    email_confirm: true,
    user_metadata: { name: targetName },
  });
  if (createErr) throw createErr;
  const targetId = created.user!.id;

  const { data: gameRow } = await admin
    .from("games")
    .select("id")
    .eq("game_date", PAST_DATE)
    .maybeSingle();
  await admin.from("rsvps").upsert(
    { game_id: gameRow!.id, player_id: targetId, status: "in", guests: 0, note: null },
    { onConflict: "game_id,player_id" }
  );

  try {
    await page.goto(`/d/${PAST_DATE}`);
    const outBtn = page.getByLabel(new RegExp(`Set ${targetName} to out`, "i"));
    await expect(outBtn).toBeVisible();
    await outBtn.click();
    // Wait for page to reflect the status change (target player moves to "Out"
    // section) rather than polling the DB, so we don't race with afterAll cleanup.
    await expect(
      page.getByRole("region", { name: /^Out$/i }).getByText(targetName)
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await admin.from("rsvps").delete().eq("player_id", targetId);
    await admin.auth.admin.deleteUser(targetId);
    await admin.from("players").update({ is_admin: false }).eq("id", authedUser.userId);
  }
});

test("invalid date returns 404", async ({ page }) => {
  const res = await page.goto("/d/2026-99-99");
  expect(res?.status()).toBe(404);
});
