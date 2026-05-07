import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase can return the joined `players` relation as either an object or a
// single-element array depending on the client's type inference path. The
// `!inner` join guarantees a row exists at runtime, so an unexpected shape
// indicates a data integrity problem — throw rather than silently emit "".
function extractJoinedName(players: unknown): string {
  if (Array.isArray(players) && players.length > 0 && typeof players[0]?.name === "string") {
    return players[0].name;
  }
  if (players && typeof players === "object" && "name" in players && typeof (players as { name: unknown }).name === "string") {
    return (players as { name: string }).name;
  }
  throw new Error("rsvp row missing joined player name");
}

export type RsvpStatus = "in" | "out" | "maybe";

export interface RosterEntry {
  playerId: string;
  name: string;
  status: RsvpStatus;
  guests: number;
  note: string | null;
}

export interface CurrentRsvp {
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
      nonResponders: { playerId: string; name: string }[] | null;
      currentUserRsvp: CurrentRsvp | null;
    };

export async function getScoreboard(
  supabase: SupabaseClient,
  opts: {
    date: string;
    includeRoster: boolean;
    // Boolean form is the simple case. Promise form lets the caller fire its
    // admin check in parallel with this function's game lookup, eliminating a
    // sequential round-trip for admin views.
    includeNonResponders?: boolean | Promise<boolean>;
    userId?: string;
  }
): Promise<ScoreboardData> {
  const includeNonResponders: Promise<boolean> = Promise.resolve(
    opts.includeNonResponders ?? false,
  ).then((v) => v === true);

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, status, status_reason")
    .eq("game_date", opts.date)
    .maybeSingle();

  if (gameErr) throw gameErr;
  if (!game) {
    // Drain to avoid an unhandled rejection if the caller's admin check fails
    // and we return before awaiting the promise.
    await includeNonResponders.catch(() => {});
    return { state: "no-game" };
  }
  if (game.status === "cancelled") {
    await includeNonResponders.catch(() => {});
    return { state: "cancelled", reason: game.status_reason ?? null };
  }

  // Only join `players` when we need names. The `players` table is gated by
  // RLS to authenticated users, so an inner join would zero out anon counts.
  // Fire the rsvps and active-players queries in parallel — they don't depend
  // on each other, only on game.id (and the active-players query is gated on
  // the admin check, which the caller may have started in parallel with us).
  const rsvpsPromise = opts.includeRoster
    ? supabase
        .from("rsvps")
        .select("player_id, status, guests, note, players!inner(name)")
        .eq("game_id", game.id)
    : supabase
        .from("rsvps")
        .select("player_id, status, guests, note")
        .eq("game_id", game.id);

  const activePlayersPromise = includeNonResponders.then((yes) =>
    yes ? supabase.from("players").select("id, name").eq("active", true) : null,
  );

  const [{ data: rsvps, error: rsvpErr }, activePlayersResult] = await Promise.all([
    rsvpsPromise,
    activePlayersPromise,
  ]);

  if (rsvpErr) throw rsvpErr;

  let inCount = 0;
  let outCount = 0;
  let maybeCount = 0;
  const roster: RosterEntry[] = [];
  let currentUserRsvp: CurrentRsvp | null = null;

  for (const r of rsvps ?? []) {
    const guests = r.guests ?? 0;
    if (r.status === "in") inCount += 1 + guests;
    else if (r.status === "maybe") maybeCount += 1 + guests;
    else if (r.status === "out") outCount += 1;

    if (opts.includeRoster) {
      roster.push({
        playerId: r.player_id,
        name: extractJoinedName((r as unknown as { players: unknown }).players),
        status: r.status as RsvpStatus,
        guests,
        note: r.note ?? null,
      });
    }

    if (opts.userId && r.player_id === opts.userId) {
      currentUserRsvp = {
        status: r.status as RsvpStatus,
        guests,
        note: r.note ?? null,
      };
    }
  }

  if (opts.includeRoster) {
    roster.sort((a, b) => a.name.localeCompare(b.name));
  }

  let nonResponders: { playerId: string; name: string }[] | null = null;
  if (activePlayersResult) {
    if (activePlayersResult.error) throw activePlayersResult.error;
    const responderIds = new Set((rsvps ?? []).map((r) => r.player_id));
    nonResponders = (activePlayersResult.data ?? [])
      .filter((p) => !responderIds.has(p.id))
      .map((p) => ({ playerId: p.id as string, name: (p.name as string) ?? "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    state: "scheduled",
    counts: { in: inCount, out: outCount, maybe: maybeCount },
    roster: opts.includeRoster ? roster : null,
    nonResponders,
    currentUserRsvp,
  };
}
