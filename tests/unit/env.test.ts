describe("env", () => {
  const originalEnv = process.env;

  function setBaseRequired() {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    process.env.HMAC_SECRET = "hmac";
    process.env.CRON_SECRET = "cron";
    process.env.APP_TIMEZONE = "America/New_York";
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.RESEND_API_KEY = "re_xxx";
    process.env.EMAIL_FROM = "OldManHoops <onboarding@resend.dev>";
  }

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.SIGNUP_CODE;
    delete process.env.SIGNUP_CODE_REQUIRED;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns the value when an env var is set", () => {
    setBaseRequired();
    process.env.SIGNUP_CODE_REQUIRED = "true";
    process.env.SIGNUP_CODE = "test-code-123";
    const { env } = require("@/lib/env");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
    expect(env.SIGNUP_CODE).toBe("test-code-123");
    expect(env.SIGNUP_CODE_REQUIRED).toBe(true);
    expect(env.EMAIL_FROM).toBe("OldManHoops <onboarding@resend.dev>");
  });

  it("throws when a required env var is missing", () => {
    setBaseRequired();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => require("@/lib/env")).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("defaults SIGNUP_CODE_REQUIRED to false when unset", () => {
    setBaseRequired();
    const { env } = require("@/lib/env");
    expect(env.SIGNUP_CODE_REQUIRED).toBe(false);
    expect(env.SIGNUP_CODE).toBeUndefined();
  });

  it("treats SIGNUP_CODE_REQUIRED='false' as disabled", () => {
    setBaseRequired();
    process.env.SIGNUP_CODE_REQUIRED = "false";
    const { env } = require("@/lib/env");
    expect(env.SIGNUP_CODE_REQUIRED).toBe(false);
  });

  it("throws when SIGNUP_CODE_REQUIRED='true' and SIGNUP_CODE is missing", () => {
    setBaseRequired();
    process.env.SIGNUP_CODE_REQUIRED = "true";
    expect(() => require("@/lib/env")).toThrow(/SIGNUP_CODE/);
  });
});
