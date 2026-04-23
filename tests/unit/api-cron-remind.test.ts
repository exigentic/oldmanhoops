/** @jest-environment node */
const mockBatch = jest.fn();
const mockNotify = jest.fn();
jest.mock("@/lib/email/send", () => ({
  sendEmailBatch: (...args: unknown[]) => mockBatch(...args),
  notifyAdmin: (...args: unknown[]) => mockNotify(...args),
}));

import { GET } from "@/app/api/cron/remind/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { getToday } from "@/lib/date";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/cron/remind", {
    method: "GET",
    headers,
  });
}

// Scoped cleanup: only touch today's game + rsvps for it. Avoids wiping rows
// seeded by other parallel-running test files (see scoreboard.test.ts).
async function clearTodaysGameAndRsvps() {
  const admin = createAdminClient();
  const today = getToday();
  const { data: game } = await admin
    .from("games")
    .select("id")
    .eq("game_date", today)
    .maybeSingle();
  if (game) {
    await admin.from("rsvps").delete().eq("game_id", game.id);
    await admin.from("games").delete().eq("id", game.id);
  }
}

async function seedGame(status: "scheduled" | "cancelled" = "scheduled") {
  const admin = createAdminClient();
  const today = getToday();
  const { data } = await admin
    .from("games")
    .upsert({ game_date: today, status }, { onConflict: "game_date" })
    .select()
    .single();
  return data!;
}

async function createPlayer(opts: {
  email: string;
  name: string;
  active?: boolean;
  reminder_email?: boolean;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    email_confirm: true,
    user_metadata: { name: opts.name },
  });
  if (error) throw error;
  const userId = data.user!.id;
  if (opts.active !== undefined || opts.reminder_email !== undefined) {
    await admin
      .from("players")
      .update({
        ...(opts.active !== undefined ? { active: opts.active } : {}),
        ...(opts.reminder_email !== undefined ? { reminder_email: opts.reminder_email } : {}),
      })
      .eq("id", userId);
  }
  return { userId, email: opts.email };
}

async function deletePlayer(userId: string) {
  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
}

describe("GET /api/cron/remind", () => {
  beforeEach(() => {
    // Pin the clock to 12:00 UTC on a weekday during EDT = 08:00 local,
    // so the reminder-hour guard passes for test bodies. The one test
    // that exercises the guard overrides system time inline.
    jest.useFakeTimers({
      doNotFake: [
        "nextTick",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
        "queueMicrotask",
        "performance",
      ],
    });
    jest.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    mockBatch.mockReset();
    mockNotify.mockReset();
    mockBatch.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("rejects requests without the bearer secret", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("skips when the local hour is not the reminder hour", async () => {
    // 13:00 UTC on the same EDT day = 09:00 local, one hour past target.
    jest.setSystemTime(new Date("2026-06-15T13:00:00Z"));
    const res = await GET(makeRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toMatch(/hour/i);
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("skips when today has no game row", async () => {
    await clearTodaysGameAndRsvps();
    const res = await GET(makeRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBeTruthy();
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("skips when today's game is cancelled", async () => {
    await clearTodaysGameAndRsvps();
    await seedGame("cancelled");
    const res = await GET(makeRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toMatch(/cancel/i);
    expect(mockBatch).not.toHaveBeenCalled();
  });

  it("batches emails for opted-in active players and excludes others", async () => {
    // The local test DB may contain players seeded by earlier tests — assert
    // only our specific emails' presence/absence, not exact totals.
    await clearTodaysGameAndRsvps();
    await seedGame("scheduled");

    const stamp = Date.now();
    const a = await createPlayer({ email: `remind-a-${stamp}@example.com`, name: "Alpha" });
    const b = await createPlayer({ email: `remind-b-${stamp}@example.com`, name: "Beta" });
    const optedOut = await createPlayer({
      email: `remind-c-${stamp}@example.com`,
      name: "Charlie",
      reminder_email: false,
    });
    const inactive = await createPlayer({
      email: `remind-d-${stamp}@example.com`,
      name: "Delta",
      active: false,
    });

    mockBatch.mockImplementation(async (emails: Array<{ to: string }>) => ({
      count: emails.length,
    }));

    try {
      const res = await GET(makeRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sent).toBeGreaterThanOrEqual(2);

      // Exactly one batch call per cron invocation.
      expect(mockBatch).toHaveBeenCalledTimes(1);
      const batchArg = mockBatch.mock.calls[0][0] as Array<{
        to: string;
        subject: string;
        html: string;
      }>;
      const recipients = batchArg.map((e) => e.to);
      expect(recipients).toContain(a.email);
      expect(recipients).toContain(b.email);
      expect(recipients).not.toContain(optedOut.email);
      expect(recipients).not.toContain(inactive.email);
      // Each entry carries per-recipient subject + html (the HMAC-signed RSVP buttons).
      for (const e of batchArg) {
        expect(typeof e.subject).toBe("string");
        expect(typeof e.html).toBe("string");
        expect(e.html.length).toBeGreaterThan(0);
      }
    } finally {
      await deletePlayer(a.userId);
      await deletePlayer(b.userId);
      await deletePlayer(optedOut.userId);
      await deletePlayer(inactive.userId);
    }
  });

  it("notifies admin and throws when the batch send errors", async () => {
    await clearTodaysGameAndRsvps();
    await seedGame("scheduled");

    const stamp = Date.now();
    const a = await createPlayer({ email: `remind-fail-${stamp}@example.com`, name: "Alpha" });

    mockBatch.mockResolvedValue({ error: "rate limited" });

    try {
      await expect(
        GET(makeRequest({ Authorization: `Bearer ${CRON_SECRET}` }))
      ).rejects.toThrow(/rate limited/i);
      expect(mockNotify).toHaveBeenCalledTimes(1);
    } finally {
      await deletePlayer(a.userId);
    }
  });
});
