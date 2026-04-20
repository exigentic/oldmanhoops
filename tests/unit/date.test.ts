import { getToday } from "@/lib/date";

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
