# OldManHoops Auth & Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Supabase Auth into the Next.js App Router: SSR client utilities, session-refresh middleware, code-protected signup at `/join`, passwordless login at `/login`, and the magic link callback route that establishes the session.

**Architecture:** `@supabase/ssr` provides three client factories — browser, server (for Server Components + route handlers), and admin (service role). All magic links funnel through `/auth/callback` which exchanges the PKCE code for a session. Signup uses `supabase.auth.signInWithOtp({ shouldCreateUser: true })` with user metadata (`name`) that the `handle_new_user` trigger (built in plan 1) consumes to create the `players` profile row atomically. Middleware runs on every request to refresh the session cookie.

**Tech Stack:** Next.js 16 App Router, @supabase/ssr, Supabase Auth (magic link / OTP), TypeScript strict mode, Jest + RTL for unit/component tests.

**Prerequisites:**
- Plan 1 complete (tagged `foundation-complete`): schema, RLS, trigger, Supabase local stack running on ports 55321-55327
- `.env.local` populated with real values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SIGNUP_CODE`

---

## File Structure Introduced

```
lib/
├── supabase/
│   ├── browser.ts          # createBrowserClient factory
│   ├── server.ts           # createServerClient factory (async, uses cookies())
│   ├── admin.ts            # service-role client
│   └── middleware.ts       # updateSession helper used by the Next.js middleware
├── env.ts                  # typed env var access (throws at boot if missing)
└── signup-code.ts          # access code validation helper
middleware.ts               # Next.js middleware — refreshes session on every request
app/
├── join/
│   ├── page.tsx            # server component — renders SignupForm with code pre-fill
│   └── SignupForm.tsx      # client component — form submission to /api/auth/signup
├── login/
│   ├── page.tsx            # server component — renders LoginForm
│   └── LoginForm.tsx       # client component — requests magic link via /api/auth/login
├── auth/
│   └── callback/
│       └── route.ts        # GET — exchanges magic-link code for session, redirects
└── api/
    └── auth/
        ├── signup/route.ts # POST — validates code + triggers signInWithOtp
        └── login/route.ts  # POST — signInWithOtp for existing users only
tests/
└── unit/
    ├── env.test.ts
    ├── signup-code.test.ts
    ├── api-signup.test.ts
    ├── api-login.test.ts
    ├── SignupForm.test.tsx
    └── LoginForm.test.tsx
supabase/config.toml         # UPDATE: add http://localhost:3000/auth/callback to additional_redirect_urls
```

Each file has one clear responsibility. The three Supabase client factories are split because their environments (browser vs server vs service-role) have incompatible APIs and consumers never need more than one at a time. Form components are split into server+client pairs (the `page.tsx` is a Server Component; the form is client) to keep the page render cheap and testable.

---

## Task 1: Typed Environment Variable Access

A single module that reads all required env vars and throws at import time if any are missing. Keeps runtime failures from happening mid-request.

**Files:**
- Create: `lib/env.ts`, `tests/unit/env.test.ts`

- [ ] **Step 1: Write a failing test**

Create `tests/unit/env.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
npm test -- env
```

Expected: FAIL — `@/lib/env` module doesn't exist.

- [ ] **Step 3: Implement `lib/env.ts`**

```ts
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
```

- [ ] **Step 4: Run test — verify PASS**

```bash
npm test -- env
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/env.ts tests/unit/env.test.ts
git commit -m "Add typed env var access helper"
```

---

## Task 2: Signup Code Validation Helper

Constant-time string comparison to validate the signup access code. Using `crypto.timingSafeEqual` prevents timing-based brute-force.

**Files:**
- Create: `lib/signup-code.ts`, `tests/unit/signup-code.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/signup-code.test.ts`:

```ts
import { validateSignupCode } from "@/lib/signup-code";

describe("validateSignupCode", () => {
  it("returns true for matching code", () => {
    expect(validateSignupCode("abc123", "abc123")).toBe(true);
  });

  it("returns false for non-matching code", () => {
    expect(validateSignupCode("abc123", "xyz789")).toBe(false);
  });

  it("returns false for a submitted code of different length", () => {
    expect(validateSignupCode("abc123", "abc")).toBe(false);
  });

  it("returns false for empty submitted code", () => {
    expect(validateSignupCode("abc123", "")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
npm test -- signup-code
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/signup-code.ts`:

```ts
import { timingSafeEqual } from "node:crypto";

export function validateSignupCode(expected: string, submitted: string): boolean {
  if (submitted.length !== expected.length) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(submitted, "utf8");
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run — verify PASS**

```bash
npm test -- signup-code
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/signup-code.ts tests/unit/signup-code.test.ts
git commit -m "Add constant-time signup code validation"
```

---

## Task 3: Supabase Client Factories

Three thin wrappers around `@supabase/ssr`: browser, server, and service-role admin. Each a single function that returns a Supabase client wired to the correct environment.

**Files:**
- Create: `lib/supabase/browser.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`

- [ ] **Step 1: Implement `lib/supabase/browser.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export function createClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
```

- [ ] **Step 2: Implement `lib/supabase/server.ts`**

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — cookies cannot be set here.
            // Middleware will refresh the session on the next request.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Implement `lib/supabase/admin.ts`**

```ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function createAdminClient() {
  return createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
```

- [ ] **Step 4: Verify with `tsc`**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/
git commit -m "Add Supabase client factories (browser, server, admin)"
```

---

## Task 4: Session-Refresh Middleware

Runs on every request. Calls `supabase.auth.getUser()` which triggers token refresh if needed, and returns the response with updated cookies.

**Files:**
- Create: `lib/supabase/middleware.ts`, `middleware.ts`

- [ ] **Step 1: Implement `lib/supabase/middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}
```

- [ ] **Step 2: Implement `middleware.ts` at repo root**

```ts
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets, favicon, images
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
```

- [ ] **Step 3: Verify with `tsc` and a dev-server smoke check**

```bash
npx tsc --noEmit
```

Start dev server, then curl a page and inspect cookies:

```bash
npm run dev -- --port 3000 > /tmp/dev.log 2>&1 &
sleep 4 && grep -q Ready /tmp/dev.log
curl -s -o /dev/null -D - http://localhost:3000/ | grep -i "^set-cookie" | head -3
pkill -f "next dev"
```

Expected: the dev server starts, home page returns 200, any middleware-written cookies appear on the response (may be empty if no session is active — that's fine; the key check is the server didn't crash).

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/middleware.ts middleware.ts
git commit -m "Add session-refresh middleware"
```

---

## Task 5: Supabase Redirect URL Configuration

`/auth/callback` needs to be registered as an allowed redirect URL in the local Supabase config, otherwise magic links will be rejected.

**Files:**
- Modify: `supabase/config.toml`

- [ ] **Step 1: Find the `[auth]` section in `supabase/config.toml`**

Look for `additional_redirect_urls`. The default list is empty or has just `http://127.0.0.1:3000`.

- [ ] **Step 2: Add the callback URL**

Update the relevant line in `supabase/config.toml` so it includes:

```toml
additional_redirect_urls = ["http://localhost:3000/auth/callback", "http://127.0.0.1:3000/auth/callback"]
```

Also verify `site_url` points to `http://localhost:3000`. If it doesn't, update it.

- [ ] **Step 3: Restart Supabase to pick up the config change**

```bash
npx supabase stop
npx supabase start
```

Wait for the stack to come up. Verify with `npx supabase status` — all services healthy.

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml
git commit -m "Allow /auth/callback as redirect URL"
```

---

## Task 6: Signup API Route

POST `/api/auth/signup` — validates the access code, then uses `signInWithOtp({ shouldCreateUser: true, data: { name } })` to create the user and send the magic link. The `handle_new_user` trigger creates the `players` row atomically.

**Files:**
- Create: `app/api/auth/signup/route.ts`, `tests/unit/api-signup.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/api-signup.test.ts`:

```ts
/** @jest-environment node */
import { POST } from "@/app/api/auth/signup/route";

// Use the real local Supabase stack. SIGNUP_CODE must match .env.local.
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
```

- [ ] **Step 2: Run — verify fail**

```bash
npm test -- api-signup
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `app/api/auth/signup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { validateSignupCode } from "@/lib/signup-code";
import { createAdminClient } from "@/lib/supabase/admin";

interface SignupBody {
  email?: string;
  name?: string;
  code?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: SignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, name, code } = body;
  if (!email || !name || !code) {
    return NextResponse.json(
      { error: "email, name, and code are required" },
      { status: 400 }
    );
  }

  if (!validateSignupCode(env.SIGNUP_CODE, code)) {
    return NextResponse.json({ error: "Invalid signup code" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: `${new URL(request.url).origin}/auth/callback`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run — verify PASS**

```bash
npm test -- api-signup
```

Expected: 3 tests pass. The "accepts valid signup" test actually creates a user in the local DB — that's fine for local tests but each run leaves a test user behind. This is acceptable for now; plan 7 will add proper E2E cleanup.

**Note:** if the valid-signup test fails because `SIGNUP_CODE` isn't loaded, ensure the test is run via `npm test` which picks up `.env.local` via Next.js's Jest transform. If needed, add `dotenv/config` as the first line of `jest.setup.ts`.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/signup/ tests/unit/api-signup.test.ts
git commit -m "Add POST /api/auth/signup with code validation"
```

---

## Task 7: Login API Route

POST `/api/auth/login` — sends a Supabase magic link to an existing user. Refuses to create new users (that's signup's job).

**Files:**
- Create: `app/api/auth/login/route.ts`, `tests/unit/api-login.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/api-login.test.ts`:

```ts
/** @jest-environment node */
import { POST } from "@/app/api/auth/login/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("rejects requests missing email", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 200 for any email (Supabase silently handles non-existent users)", async () => {
    const res = await POST(makeRequest({ email: "anything@example.com" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
npm test -- api-login
```

- [ ] **Step 3: Implement**

Create `app/api/auth/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface LoginBody {
  email?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: body.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${new URL(request.url).origin}/auth/callback`,
    },
  });

  if (error) {
    // We intentionally don't leak whether the email exists — log internally but respond 200.
    console.error("Login OTP error:", error.message);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run — verify PASS**

```bash
npm test -- api-login
```

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/login/ tests/unit/api-login.test.ts
git commit -m "Add POST /api/auth/login for passwordless login"
```

---

## Task 8: Magic Link Callback Route

GET `/auth/callback?code=xxx` — exchanges the PKCE code for a session, then redirects to the landing page (or a `next` param if supplied).

**Files:**
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: Implement**

Create `app/auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${url.origin}/login?error=missing-code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${url.origin}/login?error=invalid-code`);
  }

  return NextResponse.redirect(`${url.origin}${next}`);
}
```

- [ ] **Step 2: Verify with `tsc`**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/auth/callback/
git commit -m "Add /auth/callback to exchange magic link code for session"
```

---

## Task 9: `/join` Signup Page

Server Component that renders a client-side signup form. Form posts to `/api/auth/signup`. Accepts `?code=XXX` to pre-fill the access code for invite links.

**Files:**
- Create: `app/join/page.tsx`, `app/join/SignupForm.tsx`, `tests/unit/SignupForm.test.tsx`

- [ ] **Step 1: Write failing component test**

Create `tests/unit/SignupForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignupForm } from "@/app/join/SignupForm";

describe("SignupForm", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as jest.Mock;
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it("renders name, email, and code inputs", () => {
    render(<SignupForm initialCode="" />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/access code/i)).toBeInTheDocument();
  });

  it("pre-fills the access code from props", () => {
    render(<SignupForm initialCode="prefilled-code" />);
    expect(screen.getByLabelText(/access code/i)).toHaveValue("prefilled-code");
  });

  it("submits the form and shows a success message", async () => {
    const user = userEvent.setup();
    render(<SignupForm initialCode="" />);
    await user.type(screen.getByLabelText(/name/i), "New Player");
    await user.type(screen.getByLabelText(/email/i), "new@example.com");
    await user.type(screen.getByLabelText(/access code/i), "the-code");
    await user.click(screen.getByRole("button", { name: /sign up/i }));
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/signup",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows an error message when the API returns an error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid signup code" }),
    });
    const user = userEvent.setup();
    render(<SignupForm initialCode="" />);
    await user.type(screen.getByLabelText(/name/i), "X");
    await user.type(screen.getByLabelText(/email/i), "x@example.com");
    await user.type(screen.getByLabelText(/access code/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign up/i }));
    expect(await screen.findByText(/invalid signup code/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
npm test -- SignupForm
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SignupForm.tsx`**

Create `app/join/SignupForm.tsx`:

```tsx
"use client";

import { useState } from "react";

export function SignupForm({ initialCode }: { initialCode: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(initialCode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Signup failed");
      } else {
        setSuccess(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <p className="text-neutral-200">
        Check your email for a sign-in link.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex flex-col gap-1 text-sm text-neutral-300">
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-300">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-100"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-300">
        Access code
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-100"
        />
      </label>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-amber-400 text-neutral-950 px-4 py-2 font-semibold disabled:opacity-50"
      >
        {submitting ? "Signing up..." : "Sign up"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Implement `page.tsx`**

Create `app/join/page.tsx`:

```tsx
import { SignupForm } from "./SignupForm";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 p-6">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-amber-400">Join OldManHoops</h1>
        <p className="text-sm text-neutral-400 text-center">
          Enter the group's access code to request a sign-in link.
        </p>
        <SignupForm initialCode={code ?? ""} />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run — verify PASS**

```bash
npm test -- SignupForm
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/join/ tests/unit/SignupForm.test.tsx
git commit -m "Add /join signup page and form component"
```

---

## Task 10: `/login` Magic Link Page

Mirrors `/join` but for existing users — email only.

**Files:**
- Create: `app/login/page.tsx`, `app/login/LoginForm.tsx`, `tests/unit/LoginForm.test.tsx`

- [ ] **Step 1: Write failing component test**

Create `tests/unit/LoginForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/app/login/LoginForm";

describe("LoginForm", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as jest.Mock;
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it("renders an email input", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("submits and shows a success message", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/email/i), "x@example.com");
    await user.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" })
    );
  });
});
```

- [ ] **Step 2: Run — verify fail**

```bash
npm test -- LoginForm
```

- [ ] **Step 3: Implement `LoginForm.tsx`**

Create `app/login/LoginForm.tsx`:

```tsx
"use client";

import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSuccess(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <p className="text-neutral-200">
        Check your email for a sign-in link.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex flex-col gap-1 text-sm text-neutral-300">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2 text-neutral-100"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-amber-400 text-neutral-950 px-4 py-2 font-semibold disabled:opacity-50"
      >
        {submitting ? "Sending..." : "Send sign-in link"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Implement `page.tsx`**

Create `app/login/page.tsx`:

```tsx
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 p-6">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-amber-400">Sign in</h1>
        <p className="text-sm text-neutral-400 text-center">
          We'll email you a link to sign in.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run — verify PASS**

```bash
npm test -- LoginForm
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/login/ tests/unit/LoginForm.test.tsx
git commit -m "Add /login page and magic link form"
```

---

## Task 11: Final Verification

Prove the plan's outputs all work together.

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Unit tests**

```bash
npm test
```

Expected: all tests pass. Expected count: 10 (from plan 1) + 2 env + 4 signup-code + 3 api-signup + 2 api-login + 4 SignupForm + 2 LoginForm = **27 tests**.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: compiles cleanly. Route list should include `/join`, `/login`, `/auth/callback`, `/api/auth/signup`, `/api/auth/login`.

- [ ] **Step 4: Manual smoke in dev server**

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

In a browser at `http://devbox:3000`:
- `/join?code=<the-real-signup-code>` — form renders, access code pre-filled
- `/login` — email form renders
- `/` — still shows the foundation placeholder
- Open Mailpit at `http://devbox:55324` to see any magic link emails generated during manual testing

Stop the dev server when done.

- [ ] **Step 5: Tag**

```bash
git tag -a auth-complete -m "Plan 2 (auth and signup) complete"
```

---

## Self-Review

Spec coverage:

| Spec requirement | Covered by |
|------------------|------------|
| Code-protected signup flow | Tasks 2, 6, 9 |
| Typed env access | Task 1 |
| Constant-time code comparison | Task 2 |
| Supabase SSR client factories | Task 3 |
| Session-refresh middleware | Task 4 |
| Supabase redirect URL allowlist | Task 5 |
| `POST /api/auth/signup` | Task 6 |
| `POST /api/auth/login` | Task 7 |
| `/auth/callback` magic link handler | Task 8 |
| `/join` page with code pre-fill | Task 9 |
| `/login` page | Task 10 |
| `handle_new_user` trigger wiring | Implicit (plan 1 trigger fires on signup) |

**Not covered (deferred):**
- RSVP flow, magic link HMAC tokens (plan 4)
- Scoreboard (plan 3)
- Settings page (plan 6)
- E2E tests exercising the full signup-and-login flow (plan 7)

This plan produces: a working signup flow that creates auth users and profile rows atomically, a working login flow that sends magic links, a callback route that establishes sessions, and middleware that keeps sessions fresh across requests.
