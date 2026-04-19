/** @jest-environment node */
import { POST } from "@/app/api/auth/signup/route";

const SIGNUP_CODE = process.env.SIGNUP_CODE ?? "test-code-must-match-env";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  it("rejects requests with a bad signup code", async () => {
    const res = await POST(
      makeRequest({ email: "bad-code-test@example.com", name: "X", code: "wrong" })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/code/i);
  });

  it("rejects requests missing email", async () => {
    const res = await POST(
      makeRequest({ name: "X", code: SIGNUP_CODE })
    );
    expect(res.status).toBe(400);
  });

  it("accepts a valid signup and returns 200", async () => {
    const email = `signup-test-${Date.now()}@example.com`;
    const res = await POST(
      makeRequest({ email, name: "Signup Test", code: SIGNUP_CODE })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
