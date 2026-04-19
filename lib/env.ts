const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SIGNUP_CODE",
  "HMAC_SECRET",
  "CRON_SECRET",
  "APP_TIMEZONE",
  "ADMIN_EMAIL",
  "RESEND_API_KEY",
] as const;

type RequiredEnv = (typeof required)[number];

function read(name: RequiredEnv): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL: read("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: read("SUPABASE_SERVICE_ROLE_KEY"),
  SIGNUP_CODE: read("SIGNUP_CODE"),
  HMAC_SECRET: read("HMAC_SECRET"),
  CRON_SECRET: read("CRON_SECRET"),
  APP_TIMEZONE: read("APP_TIMEZONE"),
  ADMIN_EMAIL: read("ADMIN_EMAIL"),
  RESEND_API_KEY: read("RESEND_API_KEY"),
} as const;
