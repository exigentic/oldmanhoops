/** @jest-environment node */
jest.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
}));

import { POST } from "@/app/api/auth/email/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/email", () => {
  it("returns 401 when no session cookie is present", async () => {
    const res = await POST(makeRequest({ email: "new@example.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 even with an invalid body (auth checked first)", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 401 on non-JSON body (auth checked first)", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "bad",
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on null JSON body (no crash from null guard)", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "null",
      })
    );
    expect(res.status).toBe(401);
  });
});
