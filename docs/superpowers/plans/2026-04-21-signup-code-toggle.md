# Signup Code Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/join` signup code optional via a new `SIGNUP_CODE_REQUIRED` env var (defaults to disabled). When disabled, the access-code field is hidden in the UI and the API skips code validation.

**Architecture:** The toggle is read once at env-load time (`lib/env.ts`). The API route (`app/api/auth/signup/route.ts`) and the server component (`app/join/page.tsx`) both read `env.SIGNUP_CODE_REQUIRED` directly. The toggle is passed into the client `SignupForm` as a prop — no `NEXT_PUBLIC_*` variant, so gate state never ships to the client bundle.

**Tech Stack:** Next.js 16 App Router (Server Components + client form), TypeScript, Jest (jsdom + node environments), Playwright.

**Spec:** `docs/superpowers/specs/2026-04-21-signup-code-toggle-design.md`

---

## File Structure

**Modify:**
- `lib/env.ts` — add `SIGNUP_CODE_REQUIRED: boolean`; make `SIGNUP_CODE` conditionally required.
- `.env.example` — document the new var; note `SIGNUP_CODE` is only needed when required.
- `app/api/auth/signup/route.ts` — branch on `env.SIGNUP_CODE_REQUIRED`.
- `app/join/page.tsx` — pass `signupCodeRequired` prop; swap header description.
- `app/join/SignupForm.tsx` — add `signupCodeRequired` prop; conditionally render input; conditionally include `code` in fetch body.
- `tests/unit/env.test.ts` — toggle parsing + conditional requirement.
- `tests/unit/api-signup.test.ts` — add disabled-mode describe block.
- `tests/unit/SignupForm.test.tsx` — pass new prop; add disabled-mode tests.
- `tests/e2e/signup.spec.ts` — branch path based on `process.env.SIGNUP_CODE_REQUIRED`.

No new files are created.

---

## Task 1: Env toggle + conditional `SIGNUP_CODE`

**Files:**
- Modify: `lib/env.ts`
- Modify: `.env.example`
- Modify: `tests/unit/env.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `tests/unit/env.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/env.test.ts`

Expected: at least the three new tests fail. "defaults SIGNUP_CODE_REQUIRED to false" fails because the current env module throws when `SIGNUP_CODE` is missing; the other new tests fail because `env.SIGNUP_CODE_REQUIRED` is undefined.

- [ ] **Step 3: Update `lib/env.ts`**

Replace the contents of `lib/env.ts` with:

```ts
function require_(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const signupCodeRequired = process.env.SIGNUP_CODE_REQUIRED === "true";

function signupCode(): string | undefined {
  if (signupCodeRequired) {
    if (!process.env.SIGNUP_CODE) {
      throw new Error(
        "Missing required env var: SIGNUP_CODE (required when SIGNUP_CODE_REQUIRED=true)"
      );
    }
    return process.env.SIGNUP_CODE;
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
```

- [ ] **Step 4: Run the env tests to verify they pass**

Run: `npx jest tests/unit/env.test.ts`

Expected: all five tests pass.

- [ ] **Step 5: Update `.env.example`**

Edit `.env.example` — replace the existing `# Signup access code ...` block (the comment + `SIGNUP_CODE=` line) with:

```
# When "true", /join requires SIGNUP_CODE. When unset or any other value,
# signups are open and SIGNUP_CODE is not required.
SIGNUP_CODE_REQUIRED=false

# Signup access code (min 12 chars, URL-safe random via openssl rand -base64 12)
# Only required when SIGNUP_CODE_REQUIRED=true.
SIGNUP_CODE=replace_with_12_plus_chars
```

- [ ] **Step 6: Commit**

```bash
git add lib/env.ts tests/unit/env.test.ts .env.example
git commit -m "Add SIGNUP_CODE_REQUIRED env toggle"
```

---

## Task 2: API route skips code validation when disabled

**Files:**
- Modify: `app/api/auth/signup/route.ts`
- Modify: `tests/unit/api-signup.test.ts`

**Context:** the test file currently statically imports `POST` and reads `process.env.SIGNUP_CODE`. To exercise both modes, use `jest.isolateModules()` to re-import the route with a mutated env.

- [ ] **Step 1: Write the failing tests**

Replace the contents of `tests/unit/api-signup.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/api-signup.test.ts`

Expected: the "disabled mode" tests fail — the current route requires `code` and validates it against `env.SIGNUP_CODE`, which is now undefined.

- [ ] **Step 3: Update `app/api/auth/signup/route.ts`**

Replace the contents of `app/api/auth/signup/route.ts` with:

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

  if (env.SIGNUP_CODE_REQUIRED) {
    if (!email || !name || !code) {
      return NextResponse.json(
        { error: "email, name, and code are required" },
        { status: 400 }
      );
    }
    if (!validateSignupCode(env.SIGNUP_CODE!, code)) {
      return NextResponse.json({ error: "Invalid signup code" }, { status: 401 });
    }
  } else {
    if (!email || !name) {
      return NextResponse.json(
        { error: "email and name are required" },
        { status: 400 }
      );
    }
  }

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { name },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

Note on the `!` non-null assertion on `env.SIGNUP_CODE`: it is safe because env load throws when `SIGNUP_CODE_REQUIRED=true` and `SIGNUP_CODE` is unset (see Task 1, Step 3). The assertion is needed because `env.SIGNUP_CODE` has type `string | undefined` and `validateSignupCode` expects `string`.

- [ ] **Step 4: Run the API tests to verify they pass**

Run: `npx jest tests/unit/api-signup.test.ts`

Expected: all six tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/signup/route.ts tests/unit/api-signup.test.ts
git commit -m "Skip signup code validation when SIGNUP_CODE_REQUIRED is off"
```

---

## Task 3: `/join` page and `SignupForm` hide access-code field when disabled

**Files:**
- Modify: `app/join/page.tsx`
- Modify: `app/join/SignupForm.tsx`
- Modify: `tests/unit/SignupForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `tests/unit/SignupForm.test.tsx` with:

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

  describe("when signup code is required", () => {
    it("renders name, email, and code inputs", () => {
      render(<SignupForm initialCode="" signupCodeRequired={true} />);
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/access code/i)).toBeInTheDocument();
    });

    it("pre-fills the access code from props", () => {
      render(<SignupForm initialCode="prefilled-code" signupCodeRequired={true} />);
      expect(screen.getByLabelText(/access code/i)).toHaveValue("prefilled-code");
    });

    it("submits the form and shows a success message", async () => {
      const user = userEvent.setup();
      render(<SignupForm initialCode="" signupCodeRequired={true} />);
      await user.type(screen.getByLabelText(/name/i), "New Player");
      await user.type(screen.getByLabelText(/email/i), "new@example.com");
      await user.type(screen.getByLabelText(/access code/i), "the-code");
      await user.click(screen.getByRole("button", { name: /sign up/i }));
      expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        name: "New Player",
        email: "new@example.com",
        code: "the-code",
      });
    });

    it("shows an error message when the API returns an error", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Invalid signup code" }),
      });
      const user = userEvent.setup();
      render(<SignupForm initialCode="" signupCodeRequired={true} />);
      await user.type(screen.getByLabelText(/name/i), "X");
      await user.type(screen.getByLabelText(/email/i), "x@example.com");
      await user.type(screen.getByLabelText(/access code/i), "wrong");
      await user.click(screen.getByRole("button", { name: /sign up/i }));
      expect(await screen.findByText(/invalid signup code/i)).toBeInTheDocument();
    });
  });

  describe("when signup code is not required", () => {
    it("does not render an access-code input", () => {
      render(<SignupForm initialCode="" signupCodeRequired={false} />);
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/access code/i)).not.toBeInTheDocument();
    });

    it("ignores a prefilled initialCode and omits code from the request body", async () => {
      const user = userEvent.setup();
      render(
        <SignupForm initialCode="should-be-ignored" signupCodeRequired={false} />
      );
      await user.type(screen.getByLabelText(/name/i), "Open Player");
      await user.type(screen.getByLabelText(/email/i), "open@example.com");
      await user.click(screen.getByRole("button", { name: /sign up/i }));
      expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        name: "Open Player",
        email: "open@example.com",
      });
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/SignupForm.test.tsx`

Expected: TypeScript/render failures because `SignupForm` does not accept `signupCodeRequired`; the disabled-mode tests fail because the access-code field is still rendered.

- [ ] **Step 3: Update `app/join/SignupForm.tsx`**

Replace the contents of `app/join/SignupForm.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { VerifyOtpForm } from "@/app/_components/VerifyOtpForm";

interface SignupFormProps {
  initialCode: string;
  signupCodeRequired: boolean;
}

export function SignupForm({ initialCode, signupCodeRequired }: SignupFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(initialCode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body: { name: string; email: string; code?: string } = { name, email };
      if (signupCodeRequired) {
        body.code = code;
      }
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Signup failed");
      } else {
        setSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return <VerifyOtpForm email={email} type="invite" />;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        <span className="flex items-baseline gap-2">
          Name
          <span className="text-xs text-neutral-500 font-normal">
            won&apos;t be shown to non-members
          </span>
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          aria-invalid={!!error}
          aria-describedby={error ? "signup-error" : undefined}
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-invalid={!!error}
          aria-describedby={error ? "signup-error" : undefined}
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
        />
      </label>
      {signupCodeRequired && (
        <label className="flex flex-col gap-1 text-sm text-neutral-700">
          Access code
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            aria-invalid={!!error}
            aria-describedby={error ? "signup-error" : undefined}
            className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
          />
        </label>
      )}
      {error && (
        <p id="signup-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-indigo-600 text-white px-4 py-2 font-semibold disabled:opacity-50 hover:bg-indigo-700"
      >
        {submitting ? "Signing up..." : "Sign up"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Update `app/join/page.tsx`**

Replace the contents of `app/join/page.tsx` with:

```tsx
import Link from "next/link";
import Image from "next/image";
import { env } from "@/lib/env";
import { SignupForm } from "./SignupForm";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const signupCodeRequired = env.SIGNUP_CODE_REQUIRED;
  const description = signupCodeRequired
    ? "Enter the group's access code to request a sign-in link."
    : "Request a sign-in link.";
  return (
    <main className="min-h-screen flex flex-col items-center bg-neutral-50 text-neutral-900 p-6 pt-8 gap-6">
      <header className="flex items-center gap-4">
        <Image src="/omh.svg" alt="" width={56} height={56} />
        <div className="flex flex-col leading-tight">
          <h1 className="text-2xl font-bold text-indigo-700">Join Old Man Hoops</h1>
          <Link href="/" className="text-sm text-neutral-500 hover:underline">
            ← Back to scoreboard
          </Link>
        </div>
      </header>

      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <p className="text-sm text-neutral-600 text-center">{description}</p>
        <SignupForm
          initialCode={code ?? ""}
          signupCodeRequired={signupCodeRequired}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run the form tests to verify they pass**

Run: `npx jest tests/unit/SignupForm.test.tsx`

Expected: all six tests pass.

- [ ] **Step 6: Run the full unit suite**

Run: `npx jest`

Expected: all unit tests pass (no regressions in other files).

- [ ] **Step 7: Commit**

```bash
git add app/join/page.tsx app/join/SignupForm.tsx tests/unit/SignupForm.test.tsx
git commit -m "Hide access-code field when SIGNUP_CODE_REQUIRED is off"
```

---

## Task 4: E2E test branches on toggle

**Files:**
- Modify: `tests/e2e/signup.spec.ts`

- [ ] **Step 1: Replace the e2e spec**

Replace the contents of `tests/e2e/signup.spec.ts` with:

```ts
import { test, expect } from "./fixtures";

test("signup form accepts valid input and reveals OTP step", async ({
  page,
}, testInfo) => {
  // Signup triggers a Supabase invite email; Supabase throttles auth emails
  // per-IP (~1/60s). Running this spec on both chromium and mobile back-to-back
  // trips the throttle. Keep it to one project.
  test.skip(
    testInfo.project.name !== "chromium",
    "signup only runs on chromium to avoid Supabase auth-email rate limit"
  );

  const signupCodeRequired = process.env.SIGNUP_CODE_REQUIRED === "true";
  const email = `e2e-signup-${Date.now()}@example.com`;

  if (signupCodeRequired) {
    const code = process.env.SIGNUP_CODE;
    expect(
      code,
      "SIGNUP_CODE must be set in .env.local when SIGNUP_CODE_REQUIRED=true"
    ).toBeTruthy();

    await page.goto(`/join?code=${code}`);
    await expect(page.getByLabel(/Access code/i)).toHaveValue(code!);
    await page.getByLabel(/^Name/i).fill("E2E Signup");
    await page.getByLabel(/^Email$/i).fill(email);
  } else {
    await page.goto("/join");
    await expect(page.getByLabel(/Access code/i)).toHaveCount(0);
    await page.getByLabel(/^Name/i).fill("E2E Signup");
    await page.getByLabel(/^Email$/i).fill(email);
  }

  await page.getByRole("button", { name: /Sign up/i }).click();

  // VerifyOtpForm replaces SignupForm on success
  await expect(page.getByText(/Check your email/i)).toBeVisible();
  await expect(page.getByLabel(/^Code$/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e test**

Run: `npx playwright test tests/e2e/signup.spec.ts --project=chromium`

Expected: the test passes in whichever mode `.env.local` is configured for. If `SIGNUP_CODE_REQUIRED=true`, the enabled branch runs and asserts the prefilled code. Otherwise, the disabled branch runs and asserts the access-code field is absent.

If this fails with a rate-limit error from Supabase (invite throttle), wait ~60s and re-run — this is an environmental issue, not a code issue.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/signup.spec.ts
git commit -m "Gate signup e2e path on SIGNUP_CODE_REQUIRED"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run the full unit suite**

Run: `npx jest`

Expected: all tests pass.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 4: Manual smoke test — disabled mode**

1. In `.env.local`, ensure `SIGNUP_CODE_REQUIRED` is unset (or `=false`). `SIGNUP_CODE` may be unset too.
2. Start dev server: `npm run dev`
3. Visit `http://devbox:3000/join`
4. Confirm: no "Access code" field is visible; header says "Request a sign-in link."; submitting with name + email shows the OTP step.

- [ ] **Step 5: Manual smoke test — enabled mode**

1. In `.env.local`, set `SIGNUP_CODE_REQUIRED=true` and `SIGNUP_CODE=<some value>`.
2. Restart dev server.
3. Visit `http://devbox:3000/join`
4. Confirm: "Access code" field is visible; header says "Enter the group's access code..."; submitting with wrong code shows an "Invalid signup code" error; submitting with the correct code shows the OTP step.
5. Visit `http://devbox:3000/join?code=<correct>` — the field is prefilled.

No commit for Task 5 — verification only.
