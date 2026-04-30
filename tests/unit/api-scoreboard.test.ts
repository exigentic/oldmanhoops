/** @jest-environment node */
const getUserMock = jest.fn();
const isCurrentUserAdminMock = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

jest.mock("@/lib/auth/admin", () => ({
  isCurrentUserAdmin: (...args: unknown[]) => isCurrentUserAdminMock(...args),
}));

import { GET } from "@/app/api/scoreboard/route";

beforeEach(() => {
  getUserMock.mockReset();
  isCurrentUserAdminMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: null }, error: null });
  isCurrentUserAdminMock.mockResolvedValue(false);
});

describe("GET /api/scoreboard", () => {
  it("returns 200 with no-game when no date param is provided (defaults to today)", async () => {
    const res = await GET(new Request("http://localhost/api/scoreboard"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("no-game");
  });

  it("returns 200 with no-game when a valid date is provided", async () => {
    const res = await GET(new Request("http://localhost/api/scoreboard?date=2099-01-15"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("no-game");
  });

  it("returns 400 when date is malformed", async () => {
    const res = await GET(new Request("http://localhost/api/scoreboard?date=not-a-date"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when date is an invalid calendar date", async () => {
    const res = await GET(new Request("http://localhost/api/scoreboard?date=2026-13-01"));
    expect(res.status).toBe(400);
  });
});
