import { signToken, type RsvpStatus } from "@/lib/hmac";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

interface ReminderInput {
  playerName: string;
  playerId: string;
  gameId: string;
  gameDateText: string;
  baseUrl: string;
  hmacSecret: string;
  now?: number;
}

interface Email {
  subject: string;
  html: string;
}

function buildLink(
  base: string,
  playerId: string,
  gameId: string,
  status: RsvpStatus,
  token: string
): string {
  const u = new URL("/api/rsvp", base);
  u.searchParams.set("token", token);
  u.searchParams.set("status", status);
  u.searchParams.set("player_id", playerId);
  u.searchParams.set("game_id", gameId);
  return u.toString();
}

function button(href: string, label: string, bg: string): string {
  return `
    <a href="${href}"
       style="display:inline-block;padding:12px 24px;margin:4px;
              border-radius:8px;background:${bg};color:#fff;
              font-weight:600;text-decoration:none;font-family:system-ui,sans-serif;">
      ${label}
    </a>`;
}

export function buildReminderEmail(input: ReminderInput): Email {
  const now = input.now ?? Date.now();
  const expires = now + EIGHT_HOURS_MS;

  const tokens: Record<RsvpStatus, string> = {
    in: signToken(
      { player_id: input.playerId, game_id: input.gameId, status: "in", expires_at: expires },
      input.hmacSecret
    ),
    out: signToken(
      { player_id: input.playerId, game_id: input.gameId, status: "out", expires_at: expires },
      input.hmacSecret
    ),
    maybe: signToken(
      { player_id: input.playerId, game_id: input.gameId, status: "maybe", expires_at: expires },
      input.hmacSecret
    ),
  };

  const inLink = buildLink(input.baseUrl, input.playerId, input.gameId, "in", tokens.in);
  const outLink = buildLink(input.baseUrl, input.playerId, input.gameId, "out", tokens.out);
  const maybeLink = buildLink(input.baseUrl, input.playerId, input.gameId, "maybe", tokens.maybe);

  const greeting = input.playerName ? `Hey ${input.playerName},` : "Hey,";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,sans-serif;color:#111;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:#d97706;">Old Man Hoops</h1>
      <p style="margin:0 0 16px;color:#555;">${input.gameDateText} — noon at One Athletics.</p>
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 20px;">Are you playing today?</p>
      <div style="text-align:center;">
        ${button(inLink, "I'm In", "#059669")}
        ${button(outLink, "I'm Out", "#dc2626")}
        ${button(maybeLink, "Maybe", "#0284c7")}
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#888;">
        Links expire in 8 hours. Manage preferences at ${input.baseUrl}/settings.
      </p>
    </div>
  </body>
</html>`;

  return {
    subject: "Old Man Hoops — Are you playing today?",
    html,
  };
}
