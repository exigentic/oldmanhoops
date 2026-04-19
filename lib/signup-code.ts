import { timingSafeEqual } from "node:crypto";

export function validateSignupCode(expected: string, submitted: string): boolean {
  if (submitted.length !== expected.length) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(submitted, "utf8");
  return timingSafeEqual(a, b);
}
