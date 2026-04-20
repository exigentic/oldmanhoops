/** @jest-environment node */
const mockSend = jest.fn();
const mockNotify = jest.fn();
jest.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSend(...args),
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
    mockSend.mockReset();
    mockNotify.mockReset();
    mockSend.mockResolvedValue({ id: "mock-id" });
  });

  it("rejects requests without the bearer secret", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("skips when today has no game row", async () => {
    await clearTodaysGameAndRsvps();
    const res = await GET(makeRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBeTruthy();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("skips when today's game is cancelled", async () => {
    await clearTodaysGameAndRsvps();
    await seedGame("cancelled");
    const res = await GET(makeRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toMatch(/cancel/i);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends emails to opted-in active players and excludes others", async () => {
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

    try {
      const res = await GET(makeRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.sent).toBeGreaterThanOrEqual(2);
      expect(mockSend).toHaveBeenCalled();

      const recipients = mockSend.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(recipients).toContain(a.email);
      expect(recipients).toContain(b.email);
      expect(recipients).not.toContain(optedOut.email);
      expect(recipients).not.toContain(inactive.email);
    } finally {
      await deletePlayer(a.userId);
      await deletePlayer(b.userId);
      await deletePlayer(optedOut.userId);
      await deletePlayer(inactive.userId);
    }
  });

  it("continues past a send failure and reports the failed count", async () => {
    await clearTodaysGameAndRsvps();
    await seedGame("scheduled");

    const stamp = Date.now();
    const a = await createPlayer({ email: `remind-fail-a-${stamp}@example.com`, name: "Alpha" });
    const b = await createPlayer({ email: `remind-fail-b-${stamp}@example.com`, name: "Beta" });

    // Any send to player A fails; others succeed.
    mockSend.mockImplementation(async (to: string) => {
      if (to === a.email) return { error: "boom" };
      return { id: "ok" };
    });

    try {
      const res = await GET(makeRequest({ Authorization: `Bearer ${CRON_SECRET}` }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.failed).toBeGreaterThanOrEqual(1);
      expect(body.sent).toBeGreaterThanOrEqual(1);
      expect(body.total).toBe(body.sent + body.failed);
    } finally {
      await deletePlayer(a.userId);
      await deletePlayer(b.userId);
    }
  });
});
