import { normalizePhone, InvalidPhoneError } from "@/lib/phone";

describe("normalizePhone", () => {
  it.each([
    [null, null],
    [undefined, null],
    ["", null],
    ["   ", null],
  ])("returns null for empty input (%p)", (input, expected) => {
    expect(normalizePhone(input as string | null | undefined)).toBe(expected);
  });

  it.each([
    ["(555) 123-4567", "5551234567"],
    ["555-123-4567", "5551234567"],
    ["555.123.4567", "5551234567"],
    ["555 123 4567", "5551234567"],
    ["5551234567", "5551234567"],
    ["+1 555.123.4567", "+15551234567"],
    ["+15551234567", "+15551234567"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("normalizes human-entered number %p to %p", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    "555",
    "555-1234",
    "123456789",          // 9 digits, too short
    "1234567890123456",   // 16 digits, too long
    "call me maybe",
    "555-abcd-1234",
    "++15551234567",
    "+",
  ])("throws InvalidPhoneError for %p", (input) => {
    expect(() => normalizePhone(input)).toThrow(InvalidPhoneError);
  });

  it("InvalidPhoneError message states the expected format", () => {
    try {
      normalizePhone("abc");
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidPhoneError);
      expect((err as Error).message).toMatch(/10.?15 digits/i);
    }
  });
});
