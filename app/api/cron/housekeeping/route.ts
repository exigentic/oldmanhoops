import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday, isGameDay } from "@/lib/date";
import { env } from "@/lib/env";
import { notifyAdmin } from "@/lib/email/send";

function checkAuth(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;
  return header === expected;
}

export async function GET(request: Request): Promise<Response> {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const today = getToday();

    // Mark past scheduled games as completed.
    const { data: completed, error: completeErr } = await admin
      .from("games")
      .update({ status: "completed" })
      .lt("game_date", today)
      .eq("status", "scheduled")
      .select("id");
    if (completeErr) throw new Error(`completeErr: ${completeErr.message}`);

    let gameCreated = false;
    const todayIsGameDay = isGameDay(today);
    if (todayIsGameDay) {
      const { data: existing, error: existErr } = await admin
        .from("games")
        .select("id")
        .eq("game_date", today)
        .maybeSingle();
      if (existErr) throw new Error(`existErr: ${existErr.message}`);
      if (!existing) {
        const { error: insertErr } = await admin
          .from("games")
          .insert({ game_date: today, status: "scheduled" });
        if (insertErr) throw new Error(`insertErr: ${insertErr.message}`);
        gameCreated = true;
      }
    }

    return NextResponse.json({
      ok: true,
      today,
      todayIsGameDay,
      gamesCompleted: completed?.length ?? 0,
      gameCreated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? "" : "";
    await notifyAdmin(
      "Housekeeping cron failed",
      `Error: ${message}\n\nStack:\n${stack}`
    );
    throw err;
  }
}
