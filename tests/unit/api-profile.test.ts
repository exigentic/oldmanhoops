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

  it("returns 401 on invalid JSON body (auth checked first)", async () => {
    const res = await POST(
      new Request("http://localhost/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on null JSON body (no crash from null guard)", async () => {
    const res = await POST(
      new Request("http://localhost/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "null",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 before validating fields (no session)", async () => {
    const res = await POST(makeRequest({ name: "a".repeat(999) }));
    expect(res.status).toBe(401);
  });
});
