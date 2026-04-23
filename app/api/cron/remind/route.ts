import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday, formatGameDate, getLocalHour } from "@/lib/date";
import { env } from "@/lib/env";
import { buildReminderEmail } from "@/lib/email/reminder";
import { sendEmailBatch, notifyAdmin } from "@/lib/email/send";
import { requireCronAuth } from "@/lib/cron-auth";
import { siteOrigin } from "@/lib/site-url";

// Cron fires at both UTC hours that can map to 08:00 local (EDT and EST).
// This guard makes the non-matching firing a no-op.
const REMINDER_LOCAL_HOUR = 8;

interface PlayerRow {
  id: string;
  name: string;
  active: boolean;
  reminder_email: boolean;
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  // `?force=1` lets an authorized caller (holds CRON_SECRET) trigger the
  // reminder outside the 8am ET window — useful for manual verification.
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && getLocalHour() !== REMINDER_LOCAL_HOUR) {
    return NextResponse.json({ ok: true, skipped: "wrong-hour" });
  }

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

    // Fetch emails from auth.users (paginated; cap guards against runaway loops)
    const byId = new Map<string, string>();
    const MAX_PAGES = 10;
    const PER_PAGE = 200;
    let page = 1;
    let lastPageSize = PER_PAGE;
    for (; page <= MAX_PAGES && lastPageSize === PER_PAGE; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (error) throw new Error(`listUsersErr: ${error.message}`);
      for (const u of data.users) {
        if (u.email) byId.set(u.id, u.email);
      }
      lastPageSize = data.users.length;
    }
    if (lastPageSize === PER_PAGE) {
      throw new Error(
        `listUsersErr: pagination cap hit (>${MAX_PAGES * PER_PAGE} users); bump MAX_PAGES`
      );
    }

    const baseUrl = siteOrigin(request);
    const gameDateText = formatGameDate(today);
    const gameId = game.id;

    // Build one batch; Resend's batch API accepts up to 100 personalized emails
    // per request and counts as a single rate-limit slot, so we avoid the
    // 5 req/sec cap that previously failed most per-player sends.
    const batch: Array<{ to: string; subject: string; html: string }> = [];
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
        gameId,
        gameDateText,
        baseUrl,
        hmacSecret: env.HMAC_SECRET,
      });
      batch.push({ to: email, subject, html });
    }

    if (batch.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, failed, total: rows.length });
    }

    const result = await sendEmailBatch(batch);
    if (result.error) {
      throw new Error(`sendEmailBatch: ${result.error}`);
    }

    return NextResponse.json({
      ok: true,
      sent: result.count ?? 0,
      failed,
      total: rows.length,
    });
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
