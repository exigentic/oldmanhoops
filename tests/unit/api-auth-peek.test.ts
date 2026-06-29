/** @jest-environment node */
import { GET } from "@/app/api/auth/peek/route";
import { signToken } from "@/lib/hmac";
import { env } from "@/lib/env";

function makeRequest(query: string) {
  return new Request(`http://localhost/api/auth/peek${query}`);
}

describe("GET /api/auth/peek", () => {
  it("redirects to /login?error=missing-params when token is absent", async () => {
    const res = await GET(makeRequest(""));
    expect(res.headers.get("location")).toContain("/login?error=missing-params");
  });

  it("redirects to /login?error=invalid-token for a garbage token", async () => {
    const res = await GET(makeRequest("?token=garbage"));
    expect(res.headers.get("location")).toContain("/login?error=invalid-token");
  });

  it("redirects to /login?error=invalid-token for an expired login token", async () => {
    const token = signToken(
      { purpose: "login", player_id: "p1", expires_at: Date.now() - 1000 },
      env.HMAC_SECRET
    );
    const res = await GET(makeRequest(`?token=${encodeURIComponent(token)}`));
    expect(res.headers.get("location")).toContain("/login?error=invalid-token");
  });

  it("rejects an rsvp-purpose token with token-mismatch (no login granted)", async () => {
    const token = signToken(
      {
        purpose: "rsvp",
        player_id: "p1",
        game_id: "g1",
        status: "in",
        expires_at: Date.now() + 60_000,
      },
      env.HMAC_SECRET
    );
    const res = await GET(makeRequest(`?token=${encodeURIComponent(token)}`));
    expect(res.headers.get("location")).toContain("/login?error=token-mismatch");
  });
});
