import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { test, expect } from "./fixtures";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";
import { signToken } from "../../lib/hmac";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function todayInAppTz(): string {
  const zone = process.env.APP_TIMEZONE ?? "America/New_York";
  return DateTime.now().setZone(zone).toFormat("yyyy-MM-dd");
}

test("clicking an email link RSVPs the user, logs them in, and shows banner", async ({
  page,
}) => {
  const admin = adminClient();
  const email = `e2e-email-${Date.now()}@example.com`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: "E2E Email" },
  });
  if (createErr) throw createErr;
  const userId = created.user!.id;

  try {
    const { data: game, error: gameErr } = await admin
      .from("games")
      .select("id")
      .eq("game_date", todayInAppTz())
      .single();
    if (gameErr) throw gameErr;

    const secret = process.env.HMAC_SECRET!;
    const token = signToken(
      {
        purpose: "rsvp",
        player_id: userId,
        game_id: game.id,
        status: "in",
        expires_at: Date.now() + 8 * 60 * 60 * 1000,
      },
      secret
    );

    const url = `/api/rsvp?token=${encodeURIComponent(token)}&status=in&player_id=${userId}&game_id=${game.id}`;
    await page.goto(url);

    // After all redirects, land on / with ?status=in
    await page.waitForURL(/\/\?status=in$/);

    // Confirmation banner visible
    await expect(page.getByText(/You're In!/i)).toBeVisible();

    // Navigate to /settings — if session didn't stick we'd be bounced to /login
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: /^Settings$/i, level: 1 })
    ).toBeVisible();
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});

test("clicking the peek link logs the user in without recording an RSVP", async ({
  page,
}) => {
  const admin = adminClient();
  const email = `e2e-peek-${Date.now()}@example.com`;

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: "E2E Peek" },
  });
  if (createErr) throw createErr;
  const userId = created.user!.id;

  try {
    const secret = process.env.HMAC_SECRET!;
    const token = signToken(
      {
        purpose: "login",
        player_id: userId,
        expires_at: Date.now() + 8 * 60 * 60 * 1000,
      },
      secret
    );

    await page.goto(`/api/auth/peek?token=${encodeURIComponent(token)}`);

    // Lands on the home page — no ?status banner since nothing was RSVP'd.
    await page.waitForURL((url) => url.pathname === "/" && url.search === "");

    // Session stuck: /settings is reachable (would bounce to /login otherwise).
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: /^Settings$/i, level: 1 })
    ).toBeVisible();

    // No RSVP row was written for this player.
    const { data: rsvps, error: rsvpErr } = await admin
      .from("rsvps")
      .select("id")
      .eq("player_id", userId);
    if (rsvpErr) throw rsvpErr;
    expect(rsvps ?? []).toHaveLength(0);
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
});
