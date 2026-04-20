import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { DateTime } from "luxon";

loadEnv({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  // Dynamic import so env is loaded before lib/env.ts evaluates.
  const { createAdminClient } = await import("../lib/supabase/admin.js");

  const zone = process.env.APP_TIMEZONE ?? "America/New_York";
  const today = DateTime.now().setZone(zone).toFormat("yyyy-MM-dd");
  const status = (process.argv[2] as "scheduled" | "cancelled" | "completed") ?? "scheduled";
  const reason = process.argv[3] ?? null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("games")
    .upsert({ game_date: today, status, status_reason: reason }, { onConflict: "game_date" })
    .select()
    .single();

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }
  console.log("Game seeded:", data);
}

main();
