import { createHmac, timingSafeEqual } from "node:crypto";

export type RsvpStatus = "in" | "out" | "maybe";

export interface TokenPayload {
  player_id: string;
  game_id: string;
  status: RsvpStatus;
  expires_at: number; // unix ms
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "bad_payload" };

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function encodePayload(p: TokenPayload): string {
  return [p.player_id, p.game_id, p.status, String(p.expires_at)].join(":");
}

function decodePayload(raw: string): TokenPayload | null {
  const parts = raw.split(":");
  if (parts.length !== 4) return null;
  const [player_id, game_id, status, expiresStr] = parts;
  const expires_at = Number(expiresStr);
  if (!player_id || !game_id) return null;
  if (status !== "in" && status !== "out" && status !== "maybe") return null;
  if (!Number.isFinite(expires_at)) return null;
  return { player_id, game_id, status, expires_at };
}

function sign(payloadRaw: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payloadRaw).digest();
}

export function signToken(p: TokenPayload, secret: string): string {
  const raw = encodePayload(p);
  const sig = sign(raw, secret);
  return `${b64urlEncode(Buffer.from(raw))}.${b64urlEncode(sig)}`;
}

export function verifyToken(token: string, secret: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [pB64, sB64] = parts;
  let payloadRaw: string;
  let providedSig: Buffer;
  try {
    payloadRaw = b64urlDecode(pB64).toString("utf8");
    providedSig = b64urlDecode(sB64);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expectedSig = sign(payloadRaw, secret);
  if (providedSig.length !== expectedSig.length) return { ok: false, reason: "bad_signature" };
  if (!timingSafeEqual(providedSig, expectedSig)) return { ok: false, reason: "bad_signature" };

  const payload = decodePayload(payloadRaw);
  if (!payload) return { ok: false, reason: "bad_payload" };
  if (payload.expires_at < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
