import type { SupabaseClient } from "@supabase/supabase-js";

export type RsvpStatus = "in" | "out" | "maybe";

export interface RosterEntry {
  name: string;
  status: RsvpStatus;
  guests: number;
  note: string | null;
}

export type ScoreboardData =
  | { state: "no-game" }
  | { state: "cancelled"; reason: string | null }
  | {
      state: "scheduled";
      counts: { in: number; out: number; maybe: number };
      roster: RosterEntry[] | null;
    };

export async function getTodayScoreboard(
  supabase: SupabaseClient,
  opts: { today: string; includeRoster: boolean }
): Promise<ScoreboardData> {
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, status, status_reason")
    .eq("game_date", opts.today)
    .maybeSingle();

  if (gameErr) throw gameErr;
  if (!game) return { state: "no-game" };
  if (game.status === "cancelled") {
    return { state: "cancelled", reason: game.status_reason ?? null };
  }

  const { data: rsvps, error: rsvpErr } = await supabase
    .from("rsvps")
    .select("status, guests, note, players!inner(name)")
    .eq("game_id", game.id);

  if (rsvpErr) throw rsvpErr;

  let inCount = 0;
  let outCount = 0;
  let maybeCount = 0;
  const roster: RosterEntry[] = [];

  for (const r of rsvps ?? []) {
    const guests = r.guests ?? 0;
    if (r.status === "in") inCount += 1 + guests;
    else if (r.status === "maybe") maybeCount += 1 + guests;
    else if (r.status === "out") outCount += 1;

    if (opts.includeRoster) {
      // Supabase returns the joined players relation as an object (not array) for !inner
      const name = Array.isArray(r.players) ? r.players[0]?.name : (r.players as { name: string } | null)?.name;
      roster.push({
        name: name ?? "",
        status: r.status as RsvpStatus,
        guests,
        note: r.note ?? null,
      });
    }
  }

  return {
    state: "scheduled",
    counts: { in: inCount, out: outCount, maybe: maybeCount },
    roster: opts.includeRoster ? roster : null,
  };
}
