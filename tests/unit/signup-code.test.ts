import { validateSignupCode } from "@/lib/signup-code";

describe("validateSignupCode", () => {
  it("returns true for matching code", () => {
    expect(validateSignupCode("abc123", "abc123")).toBe(true);
  });

  it("returns false for non-matching code", () => {
    expect(validateSignupCode("abc123", "xyz789")).toBe(false);
  });

  it("returns false for a submitted code of different length", () => {
    expect(validateSignupCode("abc123", "abc")).toBe(false);
  });

  it("returns false for empty submitted code", () => {
    expect(validateSignupCode("abc123", "")).toBe(false);
  });
});
