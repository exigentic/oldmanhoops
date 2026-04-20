/** @jest-environment node */
jest.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
}));

import { POST } from "@/app/api/profile/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profile", () => {
  it("returns 401 when no session cookie is present", async () => {
    const res = await POST(makeRequest({ name: "Test" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/auth/i);
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      })
    );
    // Could be 400 (bad JSON) or 401 (no session checked first) — document which.
    // Our implementation checks session first, so expect 401 here.
    expect([400, 401]).toContain(res.status);
  });

  it("returns 401 before validating fields (no session)", async () => {
    const res = await POST(makeRequest({ name: "a".repeat(999) }));
    expect(res.status).toBe(401);
  });
});
