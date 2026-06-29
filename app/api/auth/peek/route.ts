import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/hmac";
import { env } from "@/lib/env";
import { establishEmailSession } from "@/lib/auth/email-session";

// Passive "just see who's playing" link from the reminder email. Verifies a
// login-purpose token, establishes a session, and lands on the home page —
// no RSVP is recorded. See lib/hmac.ts for the token shape.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${url.origin}/login?error=missing-params`);
  }

  const result = verifyToken(token, env.HMAC_SECRET);
  if (!result.ok) {
    return NextResponse.redirect(`${url.origin}/login?error=invalid-token`);
  }
  if (result.payload.purpose !== "login") {
    return NextResponse.redirect(`${url.origin}/login?error=token-mismatch`);
  }

  const session = await establishEmailSession(result.payload.player_id);
  if (!session.ok) {
    return NextResponse.redirect(`${url.origin}/login?error=${session.reason}`);
  }

  return NextResponse.redirect(`${url.origin}/`);
}
