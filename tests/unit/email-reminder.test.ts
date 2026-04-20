/** @jest-environment node */
import { buildReminderEmail } from "@/lib/email/reminder";
import { verifyToken } from "@/lib/hmac";

const SECRET = "test-secret-32-bytes-base64-abcdefg";

describe("buildReminderEmail", () => {
  const baseInput = {
    playerName: "Jordan",
    playerId: "player-123",
    gameId: "game-456",
    gameDateText: "Monday, April 20",
    baseUrl: "https://oldmanhoops.test",
    hmacSecret: SECRET,
  };

  it("returns a subject mentioning today's date", () => {
    const email = buildReminderEmail(baseInput);
    expect(email.subject).toMatch(/old ?man ?hoops/i);
    expect(email.subject).toMatch(/playing/i);
  });

  it("embeds three RSVP links with valid HMAC tokens", () => {
    const email = buildReminderEmail(baseInput);
    const hrefs = [...email.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const rsvpHrefs = hrefs.filter((h) => h.includes("/api/rsvp"));
    expect(rsvpHrefs).toHaveLength(3);

    for (const status of ["in", "out", "maybe"] as const) {
      const link = rsvpHrefs.find((h) => h.includes(`status=${status}`));
      expect(link).toBeDefined();
      const url = new URL(link!);
      expect(url.origin).toBe("https://oldmanhoops.test");
      expect(url.pathname).toBe("/api/rsvp");
      expect(url.searchParams.get("player_id")).toBe("player-123");
      expect(url.searchParams.get("game_id")).toBe("game-456");
      expect(url.searchParams.get("status")).toBe(status);
      const token = url.searchParams.get("token")!;
      const v = verifyToken(token, SECRET);
      expect(v.ok).toBe(true);
      if (v.ok) {
        expect(v.payload.player_id).toBe("player-123");
        expect(v.payload.game_id).toBe("game-456");
        expect(v.payload.status).toBe(status);
        const delta = v.payload.expires_at - Date.now();
        expect(delta).toBeGreaterThan(7 * 60 * 60 * 1000);
        expect(delta).toBeLessThan(9 * 60 * 60 * 1000);
      }
    }
  });

  it("greets the player by name", () => {
    const email = buildReminderEmail(baseInput);
    expect(email.html).toContain("Jordan");
  });

  it("falls back gracefully when name is empty", () => {
    const email = buildReminderEmail({ ...baseInput, playerName: "" });
    expect(email.html).toMatch(/old ?man ?hoops/i);
  });
});
