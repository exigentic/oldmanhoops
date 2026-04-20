import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday, formatGameDate } from "@/lib/date";
import { env } from "@/lib/env";
import { buildReminderEmail } from "@/lib/email/reminder";
import { sendEmail, notifyAdmin } from "@/lib/email/send";
import { requireCronAuth } from "@/lib/cron-auth";

interface PlayerRow {
  id: string;
  name: string;
  active: boolean;
  reminder_email: boolean;
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const admin = createAdminClient();
    const today = getToday();

    const { data: game, error: gameErr } = await admin
      .from("games")
      .select("id, status")
      .eq("game_date", today)
      .maybeSingle();
    if (gameErr) throw new Error(`gameErr: ${gameErr.message}`);
    if (!game) {
      return NextResponse.json({ ok: true, skipped: "no-game-today" });
    }
    if (game.status === "cancelled") {
      return NextResponse.json({ ok: true, skipped: "cancelled" });
    }

    const { data: players, error: playersErr } = await admin
      .from("players")
      .select("id, name, active, reminder_email")
      .eq("active", true)
      .eq("reminder_email", true);
    if (playersErr) throw new Error(`playersErr: ${playersErr.message}`);
    const rows = (players ?? []) as PlayerRow[];
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, failed: 0, total: 0 });
    }

    // Fetch emails from auth.users (paginated in case of large user sets)
    const byId = new Map<string, string>();
    let page = 1;
    for (let i = 0; i < 10; i++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`listUsersErr: ${error.message}`);
      for (const u of data.users) {
        if (u.email) byId.set(u.id, u.email);
      }
      if (data.users.length < 200) break;
      page += 1;
    }

    const baseUrl = new URL(request.url).origin;
    const gameDateText = formatGameDate(today);

    let sent = 0;
    let failed = 0;
    for (const p of rows) {
      const email = byId.get(p.id);
      if (!email) {
        console.error(`remind: no auth.users email for player ${p.id}`);
        failed += 1;
        continue;
      }
      const { subject, html } = buildReminderEmail({
        playerName: p.name,
        playerId: p.id,
        gameId: game.id,
        gameDateText,
        baseUrl,
        hmacSecret: env.HMAC_SECRET,
      });
      const result = await sendEmail(email, subject, html);
      if (result.error) {
        console.error(`remind: send failed for ${email}: ${result.error}`);
        failed += 1;
      } else {
        sent += 1;
      }
    }

    return NextResponse.json({ ok: true, sent, failed, total: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? "" : "";
    await notifyAdmin(
      "Reminder cron failed",
      `Error: ${message}\n\nStack:\n${stack}`
    );
    throw err;
  }
}
