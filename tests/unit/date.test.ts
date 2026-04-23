import { getToday, isGameDay, getLocalHour } from "@/lib/date";

describe("getToday", () => {
  it("returns the date in America/New_York when given a fixed UTC moment", () => {
    // 2026-04-20 02:00 UTC = 2026-04-19 22:00 ET → still April 19 in NY
    const now = new Date("2026-04-20T02:00:00Z");
    expect(getToday(now, "America/New_York")).toBe("2026-04-19");
  });

  it("returns the date in America/Los_Angeles", () => {
    const now = new Date("2026-04-20T02:00:00Z");
    expect(getToday(now, "America/Los_Angeles")).toBe("2026-04-19");
  });

  it("uses APP_TIMEZONE env when zone not provided", () => {
    const now = new Date("2026-04-20T12:00:00Z");
    expect(getToday(now)).toBe("2026-04-20");
  });
});

describe("isGameDay", () => {
  it("returns true for a Monday in America/New_York", () => {
    // 2026-04-20 is a Monday
    expect(isGameDay("2026-04-20", "America/New_York")).toBe(true);
  });

  it("returns true for Friday", () => {
    // 2026-04-24 is a Friday
    expect(isGameDay("2026-04-24", "America/New_York")).toBe(true);
  });

  it("returns false for Saturday", () => {
    // 2026-04-25 is a Saturday
    expect(isGameDay("2026-04-25", "America/New_York")).toBe(false);
  });

  it("returns false for Sunday", () => {
    // 2026-04-26 is a Sunday
    expect(isGameDay("2026-04-26", "America/New_York")).toBe(false);
  });
});

describe("getLocalHour", () => {
  it("returns 8 when the UTC moment is 12:00 UTC during EDT", () => {
    // 2026-06-15 is summer (EDT = UTC-4): 12:00 UTC → 08:00 local
    const now = new Date("2026-06-15T12:00:00Z");
    expect(getLocalHour(now, "America/New_York")).toBe(8);
  });

  it("returns 8 when the UTC moment is 13:00 UTC during EST", () => {
    // 2026-01-15 is winter (EST = UTC-5): 13:00 UTC → 08:00 local
    const now = new Date("2026-01-15T13:00:00Z");
    expect(getLocalHour(now, "America/New_York")).toBe(8);
  });

  it("returns 9 when the UTC moment is 13:00 UTC during EDT", () => {
    // Sanity check: 13:00 UTC in EDT is 09:00 local, not 08:00
    const now = new Date("2026-06-15T13:00:00Z");
    expect(getLocalHour(now, "America/New_York")).toBe(9);
  });

  it("uses APP_TIMEZONE env when zone not provided", () => {
    // APP_TIMEZONE is America/New_York in .env.local
    const now = new Date("2026-06-15T12:00:00Z");
    expect(getLocalHour(now)).toBe(8);
  });
});
