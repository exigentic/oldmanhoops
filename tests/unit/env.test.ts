describe("env", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns the value when an env var is set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    process.env.SIGNUP_CODE = "test-code-123";
    process.env.HMAC_SECRET = "hmac";
    process.env.CRON_SECRET = "cron";
    process.env.APP_TIMEZONE = "America/New_York";
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.RESEND_API_KEY = "re_xxx";
    const { env } = require("@/lib/env");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    expect(env.SIGNUP_CODE).toBe("test-code-123");
  });

  it("throws when a required env var is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => require("@/lib/env")).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
