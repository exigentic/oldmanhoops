import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentUserAdmin } from "@/lib/auth/admin";
import { getToday } from "@/lib/date";

const VALID_STATUSES = new Set(["in", "out", "maybe"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PostBody {
  player_id?: string;
  status?: string;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await isCurrentUserAdmin(supabase))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }
  const body = raw as PostBody;
  const { player_id, status } = body;
  if (!player_id || typeof player_id !== "string" || !UUID_RE.test(player_id)) {
    return NextResponse.json({ error: "player_id must be a uuid" }, { status: 400 });
  }
  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "status must be in|out|maybe" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: game, error: gameErr } = await adminClient
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

  // Status-only write: SELECT first to avoid clobbering guests/note via upsert.
  const { data: existing, error: existingErr } = await adminClient
    .from("rsvps")
    .select("id")
    .eq("game_id", game.id)
    .eq("player_id", player_id)
    .maybeSingle();
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (existing) {
    const { error: updateErr } = await adminClient
      .from("rsvps")
      .update({ status })
      .eq("game_id", game.id)
      .eq("player_id", player_id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  } else {
    const { error: insertErr } = await adminClient
      .from("rsvps")
      .insert({ game_id: game.id, player_id, status, guests: 0, note: null });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
