import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday } from "@/lib/date";
import { verifyToken } from "@/lib/hmac";
import { env } from "@/lib/env";

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

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const status = url.searchParams.get("status");
  const playerId = url.searchParams.get("player_id");
  const gameId = url.searchParams.get("game_id");

  if (!token || !status || !playerId || !gameId) {
    return NextResponse.redirect(`${url.origin}/login?error=missing-params`);
  }

  const result = verifyToken(token, env.HMAC_SECRET);
  if (!result.ok) {
    return NextResponse.redirect(`${url.origin}/login?error=invalid-token`);
  }
  const p = result.payload;
  if (p.player_id !== playerId || p.game_id !== gameId || p.status !== status) {
    return NextResponse.redirect(`${url.origin}/login?error=token-mismatch`);
  }

  const admin = createAdminClient();

  // Check game status — don't record RSVPs on cancelled games
  const { data: game, error: gameErr } = await admin
    .from("games")
    .select("id, status")
    .eq("id", p.game_id)
    .maybeSingle();
  if (gameErr || !game) {
    return NextResponse.redirect(`${url.origin}/?cancelled=1`);
  }
  if (game.status === "cancelled") {
    return NextResponse.redirect(`${url.origin}/?cancelled=1`);
  }

  // Upsert the RSVP
  const { error: upsertErr } = await admin
    .from("rsvps")
    .upsert(
      { game_id: p.game_id, player_id: p.player_id, status: p.status },
      { onConflict: "game_id,player_id" }
    );
  if (upsertErr) {
    return NextResponse.redirect(`${url.origin}/login?error=rsvp-failed`);
  }

  // Fetch email so we can generate a magic link for this user
  const { data: userResult, error: userErr } = await admin.auth.admin.getUserById(p.player_id);
  if (userErr || !userResult.user?.email) {
    return NextResponse.redirect(`${url.origin}/login?error=user-lookup-failed`);
  }

  // Generate a one-time login token (hashed_token) and immediately consume it server-side
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userResult.user.email,
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    return NextResponse.redirect(`${url.origin}/login?error=link-generation-failed`);
  }

  // Use the server client (cookie-aware) to consume the token and set session
  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyErr) {
    return NextResponse.redirect(`${url.origin}/login?error=session-failed`);
  }

  return NextResponse.redirect(`${url.origin}/?status=${p.status}`);
}
