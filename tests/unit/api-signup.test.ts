/** @jest-environment node */

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type RouteModule = typeof import("@/app/api/auth/signup/route");

function loadRouteWithEnv(envPatch: Record<string, string | undefined>): RouteModule {
  const originalEnv = { ...process.env };
  for (const [k, v] of Object.entries(envPatch)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  let mod!: RouteModule;
  jest.isolateModules(() => {
    mod = require("@/app/api/auth/signup/route");
  });
  process.env = originalEnv;
  return mod;
}

describe("POST /api/auth/signup (enabled mode)", () => {
  const SIGNUP_CODE = "test-code-must-match-env";
  let POST: RouteModule["POST"];

  beforeAll(() => {
    ({ POST } = loadRouteWithEnv({
      SIGNUP_CODE_REQUIRED: "true",
      SIGNUP_CODE,
    }));
  });

  it("rejects requests with a bad signup code", async () => {
    const res = await POST(
      makeRequest({ email: "bad-code-test@example.com", name: "X", code: "wrong" })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/code/i);
  });

  it("rejects requests missing email", async () => {
    const res = await POST(makeRequest({ name: "X", code: SIGNUP_CODE }));
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

describe("POST /api/auth/signup (disabled mode)", () => {
  let POST: RouteModule["POST"];

  beforeAll(() => {
    ({ POST } = loadRouteWithEnv({
      SIGNUP_CODE_REQUIRED: undefined,
      SIGNUP_CODE: undefined,
    }));
  });

  it("accepts a signup with no code field", async () => {
    const email = `open-signup-${Date.now()}@example.com`;
    const res = await POST(makeRequest({ email, name: "Open Signup" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("ignores an incorrect code (does not reject)", async () => {
    const email = `open-signup-ignore-${Date.now()}@example.com`;
    const res = await POST(
      makeRequest({ email, name: "Open Signup", code: "wrong-but-ignored" })
    );
    expect(res.status).toBe(200);
  });

  it("rejects requests missing email", async () => {
    const res = await POST(makeRequest({ name: "X" }));
    expect(res.status).toBe(400);
  });
});
