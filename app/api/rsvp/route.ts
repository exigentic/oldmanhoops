import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/date";

const VALID_STATUSES = new Set(["in", "out", "maybe"]);

interface PostBody {
  status?: string;
  guests?: number;
  note?: string | null;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { status, guests = 0, note = null } = body;
  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "status must be in|out|maybe" }, { status: 400 });
  }
  if (!Number.isInteger(guests) || guests < 0 || guests > 10) {
    return NextResponse.json({ error: "guests must be integer 0..10" }, { status: 400 });
  }
  if (note !== null && (typeof note !== "string" || note.length > 100)) {
    return NextResponse.json(
      { error: "note must be a string <= 100 chars or null" },
      { status: 400 }
    );
  }

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, status")
    .eq("game_date", getToday())
    .maybeSingle();
  if (gameErr) {
    return NextResponse.json({ error: gameErr.message }, { status: 500 });
  }
  if (!game) {
    return NextResponse.json({ error: "No game today" }, { status: 404 });
  }
  if (game.status === "cancelled") {
    return NextResponse.json({ error: "Game cancelled" }, { status: 403 });
  }

  const { error: upsertErr } = await supabase
    .from("rsvps")
    .upsert(
      { game_id: game.id, player_id: user.id, status, guests, note },
      { onConflict: "game_id,player_id" }
    );
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
