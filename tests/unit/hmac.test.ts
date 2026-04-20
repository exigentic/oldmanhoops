import { signToken, verifyToken } from "@/lib/hmac";

const SECRET = "test-secret-32-bytes-base64-abcdefg";

describe("hmac", () => {
  it("round-trips a valid token", () => {
    const payload = {
      player_id: "p1",
      game_id: "g1",
      status: "in" as const,
      expires_at: Date.now() + 60_000,
    };
    const token = signToken(payload, SECRET);
    const result = verifyToken(token, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual(payload);
    }
  });

  it("rejects a tampered signature", () => {
    const payload = { player_id: "p1", game_id: "g1", status: "in" as const, expires_at: Date.now() + 60_000 };
    const token = signToken(payload, SECRET);
    const [p, s] = token.split(".");
    const tampered = `${p}.${s.slice(0, -2) + "xx"}`;
    const result = verifyToken(tampered, SECRET);
    expect(result.ok).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const payload = { player_id: "p1", game_id: "g1", status: "in" as const, expires_at: Date.now() + 60_000 };
    const token = signToken(payload, SECRET);
    const result = verifyToken(token, "different-secret-totally-different");
    expect(result.ok).toBe(false);
  });

  it("rejects an expired token", () => {
    const payload = {
      player_id: "p1",
      game_id: "g1",
      status: "in" as const,
      expires_at: Date.now() - 1000,
    };
    const token = signToken(payload, SECRET);
    const result = verifyToken(token, SECRET);
    expect(result.ok).toBe(false);
  });

  it("rejects a malformed token", () => {
    expect(verifyToken("garbage", SECRET).ok).toBe(false);
    expect(verifyToken("one.two.three", SECRET).ok).toBe(false);
  });
});
