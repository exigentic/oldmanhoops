function require_(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const signupCodeRequired = process.env.SIGNUP_CODE_REQUIRED === "true";

function signupCode(): string | undefined {
  if (signupCodeRequired && !process.env.SIGNUP_CODE) {
    throw new Error(
      "Missing required env var: SIGNUP_CODE (required when SIGNUP_CODE_REQUIRED=true)"
    );
  }
  return process.env.SIGNUP_CODE;
}

// NEXT_PUBLIC_* must use literal property access so Next.js inlines them
// into the client bundle at build time. Dynamic access via process.env[name]
// does not get inlined and would be undefined in the browser.
export const env = {
  NEXT_PUBLIC_SUPABASE_URL: require_(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: require_(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  SUPABASE_SERVICE_ROLE_KEY: require_(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ),
  SIGNUP_CODE_REQUIRED: signupCodeRequired,
  SIGNUP_CODE: signupCode(),
  HMAC_SECRET: require_("HMAC_SECRET", process.env.HMAC_SECRET),
  CRON_SECRET: require_("CRON_SECRET", process.env.CRON_SECRET),
  APP_TIMEZONE: require_("APP_TIMEZONE", process.env.APP_TIMEZONE),
  ADMIN_EMAIL: require_("ADMIN_EMAIL", process.env.ADMIN_EMAIL),
  RESEND_API_KEY: require_("RESEND_API_KEY", process.env.RESEND_API_KEY),
  EMAIL_FROM: require_("EMAIL_FROM", process.env.EMAIL_FROM),
} as const;
