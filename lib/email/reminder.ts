import { signToken, type RsvpStatus } from "@/lib/hmac";

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
const STATUSES: RsvpStatus[] = ["in", "out", "maybe"];

const LABELS: Record<RsvpStatus, { label: string; bg: string }> = {
  in: { label: "I'm In", bg: "#059669" },
  out: { label: "I'm Out", bg: "#dc2626" },
  maybe: { label: "Maybe", bg: "#0284c7" },
};

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
      ${escapeHtml(label)}
    </a>`;
}

export function buildReminderEmail(input: ReminderInput): Email {
  const now = input.now ?? Date.now();
  const expires = now + EIGHT_HOURS_MS;

  const buttons = STATUSES.map((status) => {
    const token = signToken(
      { player_id: input.playerId, game_id: input.gameId, status, expires_at: expires },
      input.hmacSecret
    );
    const href = buildLink(input.baseUrl, input.playerId, input.gameId, status, token);
    const { label, bg } = LABELS[status];
    return button(href, label, bg);
  }).join("\n");

  const greeting = input.playerName
    ? `Hey ${escapeHtml(input.playerName)},`
    : "Hey,";

  const safeDate = escapeHtml(input.gameDateText);
  const safeBase = escapeHtml(input.baseUrl);

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,sans-serif;color:#111;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:#d97706;">Old Man Hoops</h1>
      <p style="margin:0 0 16px;color:#555;">${safeDate} — noon at One Athletics.</p>
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 20px;">Are you playing today?</p>
      <div style="text-align:center;">
        ${buttons}
      </div>
      <p style="margin:24px 0 0;font-size:12px;color:#888;">
        Links expire in 8 hours. Manage preferences at ${safeBase}/settings.
      </p>
    </div>
  </body>
</html>`;

  return {
    subject: "Old Man Hoops — Are you playing today?",
    html,
  };
}
