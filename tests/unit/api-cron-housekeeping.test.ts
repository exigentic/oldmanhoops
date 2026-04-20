/** @jest-environment node */
jest.mock("@/lib/email/send", () => ({
  sendEmail: jest.fn().mockResolvedValue({ id: "mock" }),
  notifyAdmin: jest.fn().mockResolvedValue(undefined),
}));

import { GET } from "@/app/api/cron/housekeeping/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday } from "@/lib/date";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/cron/housekeeping", {
    method: "GET",
    headers,
  });
}

// Only clean dates this suite actually touches — the DB is shared with other
// test suites (e.g. scoreboard.test.ts seeds far-future dates), so a blanket
// wipe would break parallel suites.
const PAST_DATE = "2020-01-06";

async function wipeGames() {
  const admin = createAdminClient();
  const today = getToday();
  await admin.from("games").delete().in("game_date", [PAST_DATE, today]);
}

describe("GET /api/cron/housekeeping", () => {
  beforeEach(async () => {
    await wipeGames();
  });

  afterAll(async () => {
    await wipeGames();
  });

  it("rejects requests without the bearer secret", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("rejects requests with a wrong bearer secret", async () => {
    const res = await GET(makeRequest({ Authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("marks past scheduled games as completed", async () => {
    const admin = createAdminClient();
    const past = PAST_DATE; // a Monday, safely in the past
    await admin.from("games").insert({ game_date: past, status: "scheduled" });

    const res = await GET(makeRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gamesCompleted).toBeGreaterThanOrEqual(1);

    const { data } = await admin
      .from("games")
      .select("status")
      .eq("game_date", past)
      .single();
    expect(data?.status).toBe("completed");
  });

  it("creates today's game row when today is a weekday", async () => {
    const today = getToday();
    const { DateTime } = await import("luxon");
    const weekday = DateTime.fromFormat(today, "yyyy-MM-dd", {
      zone: process.env.APP_TIMEZONE,
    }).weekday;
    if (weekday >= 6) return; // Saturday/Sunday: skip

    const res = await GET(makeRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);

    const admin = createAdminClient();
    const { data } = await admin
      .from("games")
      .select("game_date, status")
      .eq("game_date", today)
      .single();
    expect(data).toBeTruthy();
    expect(data?.status).toBe("scheduled");
  });

  it("is idempotent; gameCreated is true on first run and false on second", async () => {
    const today = getToday();
    const { DateTime } = await import("luxon");
    const weekday = DateTime.fromFormat(today, "yyyy-MM-dd", {
      zone: process.env.APP_TIMEZONE,
    }).weekday;

    const headers = { Authorization: `Bearer ${CRON_SECRET}` };
    const first = await GET(makeRequest(headers));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    const second = await GET(makeRequest(headers));
    expect(second.status).toBe(200);
    const secondBody = await second.json();

    if (weekday >= 6) {
      // Weekend: neither run creates a row
      expect(firstBody.gameCreated).toBe(false);
      expect(secondBody.gameCreated).toBe(false);
    } else {
      expect(firstBody.gameCreated).toBe(true);
      expect(secondBody.gameCreated).toBe(false);
    }

    const admin = createAdminClient();
    const { data } = await admin.from("games").select("id").eq("game_date", today);
    expect((data ?? []).length).toBeLessThanOrEqual(1);
  });
});
