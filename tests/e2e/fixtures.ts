import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { test as base, expect } from "@playwright/test";
import { DateTime } from "luxon";

// Load .env.local so dynamic imports of lib/env resolve at fixture init.
loadEnv({ path: resolve(process.cwd(), ".env.local") });

// Import lazily so env vars are populated before lib/env evaluates.
async function adminClient() {
  const mod = await import("../../lib/supabase/admin");
  return mod.createAdminClient();
}

function uniqueEmail(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `e2e-${Date.now()}-${rand}@example.com`;
}

function todayInAppTz(): string {
  const zone = process.env.APP_TIMEZONE ?? "America/New_York";
  return DateTime.now().setZone(zone).toFormat("yyyy-MM-dd");
}

type AuthedUser = { email: string; userId: string };

type Fixtures = {
  cleanToday: void;
  authedUser: AuthedUser;
};

export const test = base.extend<Fixtures>({
  // Auto-applied: ensures today's game row exists and is scheduled.
  cleanToday: [
    async ({}, use) => {
      const admin = await adminClient();
      const today = todayInAppTz();
      await admin
        .from("games")
        .upsert(
          { game_date: today, status: "scheduled" },
          { onConflict: "game_date" }
        );
      await use();
    },
    { auto: true },
  ],

  authedUser: async ({ page }, use) => {
    const admin = await adminClient();
    const email = uniqueEmail();

    // Create user (handle_new_user trigger inserts the players row).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name: `E2E ${email.slice(4, 10)}` },
    });
    if (createErr) throw createErr;
    const userId = created.user!.id;

    // Generate a magic link and extract the one-time OTP.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr) throw linkErr;
    const otp = link.properties?.email_otp;
    if (!otp) throw new Error("generateLink did not return email_otp");

    // Hand the OTP to our verify endpoint via the browser context so the
    // Supabase session cookies land on this page's context.
    const res = await page.request.post("/api/auth/verify", {
      data: { email, token: otp, type: "email" },
    });
    expect(res.ok(), `verify returned ${res.status()}`).toBeTruthy();

    await use({ email, userId });

    // Teardown — delete the user; rsvps cascade.
    await admin.auth.admin.deleteUser(userId);
  },
});

export { expect };
