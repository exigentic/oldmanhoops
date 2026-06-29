import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type EmailSessionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "user-lookup-failed" | "link-generation-failed" | "session-failed";
    };

/**
 * Establishes a logged-in session for the given player from a verified email
 * link. Looks up the player's email, mints a one-time magic-link token, and
 * verifies it against the request-scoped server client so the session cookie
 * is written onto the response.
 *
 * Shared by the RSVP-from-email flow (`/api/rsvp` GET) and the passive login
 * link (`/api/auth/peek`). Callers own the redirect; on failure the returned
 * `reason` maps directly to a `/login?error=<reason>` query.
 */
export async function establishEmailSession(playerId: string): Promise<EmailSessionResult> {
  const admin = createAdminClient();

  const { data: userResult, error: userErr } = await admin.auth.admin.getUserById(playerId);
  if (userErr || !userResult.user?.email) {
    return { ok: false, reason: "user-lookup-failed" };
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userResult.user.email,
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    return { ok: false, reason: "link-generation-failed" };
  }

  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyErr) {
    return { ok: false, reason: "session-failed" };
  }

  return { ok: true };
}
