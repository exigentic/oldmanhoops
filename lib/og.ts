import type { SupabaseClient } from "@supabase/supabase-js";

export type OgCardData =
  | { state: "no-game" }
  | { state: "cancelled"; reason: string | null }
  | { state: "scheduled"; in: number; maybe: number };

export async function getOgCounts(
  supabase: SupabaseClient,
  date: string
): Promise<OgCardData> {
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, status, status_reason")
    .eq("game_date", date)
    .maybeSingle();

  if (gameErr) throw gameErr;
  if (!game) return { state: "no-game" };
  if (game.status === "cancelled") {
    return { state: "cancelled", reason: game.status_reason ?? null };
  }

  const { data: rsvps, error: rsvpErr } = await supabase
    .from("rsvps")
    .select("status, guests")
    .eq("game_id", game.id);

  if (rsvpErr) throw rsvpErr;

  let inCount = 0;
  let maybeCount = 0;
  for (const r of rsvps ?? []) {
    const guests = r.guests ?? 0;
    if (r.status === "in") inCount += 1 + guests;
    else if (r.status === "maybe") maybeCount += 1 + guests;
  }

  return { state: "scheduled", in: inCount, maybe: maybeCount };
}
