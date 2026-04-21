# Phone Number Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let new and existing members save a phone number on their profile (even though SMS is not wired up yet), behind a shared normalization rule.

**Architecture:** Pure text column `players.phone` already exists. A new `lib/phone.ts` helper is the single source of truth for validation; both `POST /api/profile` and `POST /api/auth/signup` call it. A trigger migration lets signup-time metadata flow into the row via the existing `handle_new_user` path.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (local stack via CLI), Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-04-21-phone-number-field-design.md`

---

## File Structure

**Create:**
- `lib/phone.ts` — `normalizePhone`, `InvalidPhoneError`.
- `tests/unit/phone.test.ts` — table-driven unit tests for the helper.
- `supabase/migrations/<timestamp>_handle_new_user_phone.sql` — updated trigger function.

**Modify:**
- `app/api/profile/route.ts` — accept `phone` in `ProfileBody`.
- `app/api/auth/signup/route.ts` — accept `phone` in `SignupBody`, forward to invite metadata.
- `app/settings/page.tsx` — select `phone`, pass `initialPhone`.
- `app/settings/SettingsForm.tsx` — add Phone section.
- `app/join/SignupForm.tsx` — add optional phone input.
- `tests/unit/SettingsForm.test.tsx` — add phone-section tests.
- `tests/unit/SignupForm.test.tsx` — add optional-phone tests.
- `tests/unit/api-signup.test.ts` — add phone-validation + persistence test.
- `tests/unit/schema.test.ts` — add assertion that the trigger copies phone when present.
- `tests/e2e/settings.spec.ts` — extend to set/persist/clear phone.

---

## Task 1: `normalizePhone` helper with unit tests

**Files:**
- Create: `lib/phone.ts`
- Create: `tests/unit/phone.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/phone.test.ts`:

```ts
import { normalizePhone, InvalidPhoneError } from "@/lib/phone";

describe("normalizePhone", () => {
  it.each([
    [null, null],
    [undefined, null],
    ["", null],
    ["   ", null],
  ])("returns null for empty input (%p)", (input, expected) => {
    expect(normalizePhone(input as string | null | undefined)).toBe(expected);
  });

  it.each([
    ["(555) 123-4567", "5551234567"],
    ["555-123-4567", "5551234567"],
    ["555.123.4567", "5551234567"],
    ["555 123 4567", "5551234567"],
    ["5551234567", "5551234567"],
    ["+1 555.123.4567", "+15551234567"],
    ["+15551234567", "+15551234567"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("normalizes human-entered number %p to %p", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    "555",
    "555-1234",
    "123456789",          // 9 digits, too short
    "1234567890123456",   // 16 digits, too long
    "call me maybe",
    "555-abcd-1234",
    "++15551234567",
    "+",
  ])("throws InvalidPhoneError for %p", (input) => {
    expect(() => normalizePhone(input)).toThrow(InvalidPhoneError);
  });

  it("InvalidPhoneError message states the expected format", () => {
    try {
      normalizePhone("abc");
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidPhoneError);
      expect((err as Error).message).toMatch(/10.?15 digits/i);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/unit/phone.test.ts`
Expected: FAIL with "Cannot find module '@/lib/phone'" (or similar).

- [ ] **Step 3: Implement the helper**

Create `lib/phone.ts`:

```ts
export class InvalidPhoneError extends Error {
  constructor(message = "Phone must be 10–15 digits") {
    super(message);
    this.name = "InvalidPhoneError";
  }
}

const STRIP_CHARS = /[\s().\-]/g;
const VALID = /^\+?\d{10,15}$/;

export function normalizePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const stripped = trimmed.replace(STRIP_CHARS, "");
  if (!VALID.test(stripped)) {
    throw new InvalidPhoneError();
  }
  return stripped;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/unit/phone.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/phone.ts tests/unit/phone.test.ts
git commit -m "Add phone number normalization helper"
```

---

## Task 2: Migration — `handle_new_user` copies phone from metadata

**Files:**
- Create: `supabase/migrations/<timestamp>_handle_new_user_phone.sql`
- Modify: `tests/unit/schema.test.ts`

- [ ] **Step 1: Write the failing schema assertion**

Add to `tests/unit/schema.test.ts`, inside the `describe("initial schema", ...)` block (place it after the two existing trigger tests for `name`):

```ts
  it("copies phone from raw_user_meta_data when present", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
           VALUES (gen_random_uuid(), 'phone-trigger@example.com', '', now(), 'authenticated', 'authenticated',
                   '{"name":"P","phone":"5551234567"}'::jsonb)
           RETURNING id`
      );
      const userId = res.rows[0].id;
      const playerRes = await client.query(
        `SELECT phone FROM public.players WHERE id = $1`,
        [userId]
      );
      expect(playerRes.rows[0].phone).toBe("5551234567");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("leaves phone null when raw_user_meta_data lacks phone key", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
           VALUES (gen_random_uuid(), 'no-phone@example.com', '', now(), 'authenticated', 'authenticated',
                   '{"name":"X"}'::jsonb)
           RETURNING id`
      );
      const userId = res.rows[0].id;
      const playerRes = await client.query(
        `SELECT phone FROM public.players WHERE id = $1`,
        [userId]
      );
      expect(playerRes.rows[0].phone).toBeNull();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("leaves phone null when raw_user_meta_data.phone is empty string", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_user_meta_data)
           VALUES (gen_random_uuid(), 'empty-phone@example.com', '', now(), 'authenticated', 'authenticated',
                   '{"name":"X","phone":""}'::jsonb)
           RETURNING id`
      );
      const userId = res.rows[0].id;
      const playerRes = await client.query(
        `SELECT phone FROM public.players WHERE id = $1`,
        [userId]
      );
      expect(playerRes.rows[0].phone).toBeNull();
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/unit/schema.test.ts -t "copies phone"`
Expected: the "copies phone" test fails (player row exists but phone is null because the current trigger ignores the phone key).

- [ ] **Step 3: Create the migration**

Generate a filename with the current UTC timestamp (format `YYYYMMDDhhmmss`). On zsh/bash:

```bash
TS=$(date -u +%Y%m%d%H%M%S)
FILE="supabase/migrations/${TS}_handle_new_user_phone.sql"
echo "$FILE"
```

Write the file contents:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.players (id, name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  );
  RETURN NEW;
END;
$$;
```

Do not redefine the trigger itself — `on_auth_user_created` still references the function by name and will pick up the new body automatically.

- [ ] **Step 4: Apply the migration locally**

Run: `npx supabase db reset`
Expected: output ends with "Finished `supabase db reset`." and no error lines.

If `supabase db reset` is undesirable in your workflow, use `npx supabase migration up` instead to apply only new migrations.

- [ ] **Step 5: Run the schema tests to verify they pass**

Run: `npx jest tests/unit/schema.test.ts`
Expected: all tests pass, including the three new "phone" assertions.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_handle_new_user_phone.sql tests/unit/schema.test.ts
git commit -m "Copy phone metadata into players on signup"
```

---

## Task 3: Extend `/api/profile` to accept `phone`

**Files:**
- Modify: `app/api/profile/route.ts`

No new unit test is added here — `tests/unit/api-profile.test.ts` only exercises 401 paths (the route requires a live Supabase session, which those tests do not set up). Phone-specific behavior on this route is covered by (a) the unit test on `normalizePhone` (Task 1), (b) the SettingsForm component tests (Task 5), and (c) the e2e settings spec (Task 7).

- [ ] **Step 1: Modify the route**

Edit `app/api/profile/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone, InvalidPhoneError } from "@/lib/phone";

interface ProfileBody {
  name?: string;
  reminder_email?: boolean;
  active?: boolean;
  phone?: string | null;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }
  const body = raw as ProfileBody;

  const update: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "name must be a string" }, { status: 400 });
    }
    const trimmed = body.name.trim();
    if (trimmed.length === 0 || trimmed.length > 50) {
      return NextResponse.json(
        { error: "name must be 1-50 characters" },
        { status: 400 }
      );
    }
    update.name = trimmed;
  }

  if (body.reminder_email !== undefined) {
    if (typeof body.reminder_email !== "boolean") {
      return NextResponse.json(
        { error: "reminder_email must be boolean" },
        { status: 400 }
      );
    }
    update.reminder_email = body.reminder_email;
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "active must be boolean" }, { status: 400 });
    }
    update.active = body.active;
  }

  if (body.phone !== undefined) {
    if (body.phone !== null && typeof body.phone !== "string") {
      return NextResponse.json(
        { error: "phone must be a string or null" },
        { status: 400 }
      );
    }
    try {
      update.phone = normalizePhone(body.phone);
    } catch (err) {
      if (err instanceof InvalidPhoneError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from("players")
    .update(update)
    .eq("id", user.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Run existing profile tests to confirm nothing regresses**

Run: `npx jest tests/unit/api-profile.test.ts`
Expected: all 4 existing tests pass (they only check 401 paths).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/profile/route.ts
git commit -m "Accept phone in /api/profile"
```

---

## Task 4: Extend `/api/auth/signup` to accept `phone`

**Files:**
- Modify: `app/api/auth/signup/route.ts`
- Modify: `tests/unit/api-signup.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/api-signup.test.ts`, inside the existing `describe("POST /api/auth/signup", ...)` block:

```ts
  it("rejects invalid phone format with 400", async () => {
    const res = await POST(
      makeRequest({
        email: `bad-phone-${Date.now()}@example.com`,
        name: "X",
        code: SIGNUP_CODE,
        phone: "not-a-phone",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/10.?15 digits/i);
  });

  it("accepts a valid phone and stores the normalized value on the player", async () => {
    // The signup route sets phone in user_metadata; the handle_new_user
    // trigger copies it into public.players.
    const { createClient: createSb } = await import("@supabase/supabase-js");
    const admin = createSb(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const email = `signup-phone-${Date.now()}@example.com`;
    const res = await POST(
      makeRequest({
        email,
        name: "Phone Test",
        code: SIGNUP_CODE,
        phone: "(555) 123-4567",
      })
    );
    expect(res.status).toBe(200);

    // Look up the user, then the player row.
    const { data: list } = await admin.auth.admin.listUsers();
    const user = list.users.find((u) => u.email === email);
    expect(user, `invited user ${email} should exist`).toBeTruthy();

    const { data: player, error } = await admin
      .from("players")
      .select("phone")
      .eq("id", user!.id)
      .single();
    expect(error).toBeNull();
    expect(player?.phone).toBe("5551234567");

    // Teardown — delete the invited user (cascades to players).
    await admin.auth.admin.deleteUser(user!.id);
  });

  it("accepts a signup without phone (key absent)", async () => {
    const email = `signup-no-phone-${Date.now()}@example.com`;
    const res = await POST(
      makeRequest({ email, name: "No Phone", code: SIGNUP_CODE })
    );
    expect(res.status).toBe(200);
  });
```

- [ ] **Step 2: Run to verify the new "invalid phone" test fails**

Run: `npx jest tests/unit/api-signup.test.ts -t "invalid phone"`
Expected: fails — current route ignores the `phone` field and returns 200.

- [ ] **Step 3: Modify the signup route**

Edit `app/api/auth/signup/route.ts`:

```ts
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { validateSignupCode } from "@/lib/signup-code";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone, InvalidPhoneError } from "@/lib/phone";

interface SignupBody {
  email?: string;
  name?: string;
  code?: string;
  phone?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: SignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, name, code, phone } = body;
  if (!email || !name || !code) {
    return NextResponse.json(
      { error: "email, name, and code are required" },
      { status: 400 }
    );
  }

  if (!validateSignupCode(env.SIGNUP_CODE, code)) {
    return NextResponse.json({ error: "Invalid signup code" }, { status: 401 });
  }

  // Phone is optional; treat empty/whitespace-only as absent.
  let normalizedPhone: string | null = null;
  if (typeof phone === "string" && phone.trim().length > 0) {
    try {
      normalizedPhone = normalizePhone(phone);
    } catch (err) {
      if (err instanceof InvalidPhoneError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  const metadata: Record<string, string> = { name };
  if (normalizedPhone !== null) {
    metadata.phone = normalizedPhone;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: metadata,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run the signup tests**

Run: `npx jest tests/unit/api-signup.test.ts`
Expected: all tests pass.

Note: the "accepts a valid phone and stores the normalized value" test makes a real call to local Supabase. Make sure `supabase start` is running and `.env.local` has `SIGNUP_CODE`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. If the test flakes on auth-email rate limits, wait ~60s and re-run.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/auth/signup/route.ts tests/unit/api-signup.test.ts
git commit -m "Accept phone in /api/auth/signup"
```

---

## Task 5: Settings page and form — Phone section

**Files:**
- Modify: `app/settings/page.tsx`
- Modify: `app/settings/SettingsForm.tsx`
- Modify: `tests/unit/SettingsForm.test.tsx`

- [ ] **Step 1: Update `app/settings/page.tsx` to fetch and pass phone**

Edit the supabase select and the `<SettingsForm />` props:

```tsx
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("name, phone, reminder_email, active")
    .eq("id", user.id)
    .single();
  if (playerErr) {
    console.error(`settings: player fetch failed for ${user.id}: ${playerErr.message}`);
  }

  const pendingEmail = user.new_email ?? null;

  return (
    <main className="min-h-screen flex flex-col items-center bg-neutral-50 text-neutral-900 p-6 pt-8 gap-6">
      <header className="flex items-center gap-4">
        <Image src="/omh.svg" alt="" width={56} height={56} />
        <div className="flex flex-col leading-tight">
          <h1 className="text-2xl font-bold text-indigo-700">Settings</h1>
          <Link href="/" className="text-sm text-neutral-500 hover:underline">
            ← Back to scoreboard
          </Link>
        </div>
      </header>

      <SettingsForm
        initialName={player?.name ?? ""}
        initialEmail={user.email ?? ""}
        initialPhone={player?.phone ?? null}
        initialReminderEmail={player?.reminder_email ?? true}
        initialActive={player?.active ?? true}
        pendingEmail={pendingEmail}
      />
    </main>
  );
```

- [ ] **Step 2: Write the failing component tests**

Append to `tests/unit/SettingsForm.test.tsx`, inside the existing `describe("SettingsForm", ...)` block. First update `BASE` to include the new prop:

```ts
const BASE = {
  initialName: "Jordan",
  initialEmail: "jordan@example.com",
  initialPhone: null as string | null,
  initialReminderEmail: true,
  initialActive: true,
  pendingEmail: null as string | null,
};
```

Then add:

```tsx
  it("pre-fills phone from initialPhone", () => {
    render(<SettingsForm {...BASE} initialPhone="5551234567" />);
    expect(screen.getByLabelText(/^Phone$/i)).toHaveValue("5551234567");
  });

  it("shows empty phone input when initialPhone is null", () => {
    render(<SettingsForm {...BASE} />);
    expect(screen.getByLabelText(/^Phone$/i)).toHaveValue("");
  });

  it("POSTs normalized-entry phone to /api/profile when Save phone clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} />);
    const input = screen.getByLabelText(/^Phone$/i);
    await user.type(input, "(555) 123-4567");
    await user.click(screen.getByRole("button", { name: /save phone/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phone: "(555) 123-4567" }),
      })
    );
  });

  it("POSTs { phone: null } when saving an empty phone input", async () => {
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} initialPhone="5551234567" />);
    const input = screen.getByLabelText(/^Phone$/i);
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: /save phone/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phone: null }),
      })
    );
  });

  it("disables Save phone button when the input matches the last saved value", () => {
    render(<SettingsForm {...BASE} initialPhone="5551234567" />);
    expect(screen.getByRole("button", { name: /save phone/i })).toBeDisabled();
  });

  it("shows the server error when phone save fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Phone must be 10–15 digits" }),
    });
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} />);
    await user.type(screen.getByLabelText(/^Phone$/i), "bad");
    await user.click(screen.getByRole("button", { name: /save phone/i }));
    expect(await screen.findByText(/10.?15 digits/i)).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run to verify the new tests fail**

Run: `npx jest tests/unit/SettingsForm.test.tsx`
Expected: all new phone tests fail (no `/^Phone$/i` label exists yet). Existing tests still pass.

- [ ] **Step 4: Update `SettingsForm`**

Edit `app/settings/SettingsForm.tsx`:

1. Extend the props interface:

```ts
interface SettingsFormProps {
  initialName: string;
  initialEmail: string;
  initialPhone: string | null;
  initialReminderEmail: boolean;
  initialActive: boolean;
  pendingEmail?: string | null;
}
```

2. Accept the new prop in the function signature:

```tsx
export function SettingsForm({
  initialName,
  initialEmail,
  initialPhone,
  initialReminderEmail,
  initialActive,
  pendingEmail = null,
}: SettingsFormProps) {
```

3. Add a Phone state block near the Name block (just below the `saveName` function):

```tsx
  // Phone section
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [savedPhone, setSavedPhone] = useState(initialPhone ?? "");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneSaved, flashPhoneSaved] = useFlashValue<true>(2000);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  async function savePhone() {
    const trimmed = phone.trim();
    setPhone(trimmed);
    setPhoneSaving(true);
    setPhoneError(null);
    const payload = trimmed.length === 0 ? null : trimmed;
    const r = await postJson("/api/profile", { phone: payload });
    setPhoneSaving(false);
    if (r.ok) {
      setSavedPhone(trimmed);
      flashPhoneSaved(true);
    } else {
      setPhoneError(r.error ?? "Update failed");
    }
  }
```

4. Insert a Phone form between the Name form and the Email form. The helper text lives in a separate `<p>` linked via `aria-describedby` so the `<label>` accessible name stays exactly `"Phone"` (this is what the `getByLabelText(/^Phone$/i)` tests match):

```tsx
      {/* Phone */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          savePhone();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor="phone" className="text-sm text-neutral-700">
          Phone
        </label>
        <p id="phone-help" className="text-xs text-neutral-500 -mt-1">
          Optional — we&apos;ll use this for SMS reminders when that&apos;s added.
        </p>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          aria-invalid={!!phoneError}
          aria-describedby={phoneError ? "phone-error phone-help" : "phone-help"}
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={phoneSaving || phone.trim() === savedPhone}
            className="rounded-md bg-indigo-600 text-white px-4 py-2 font-semibold disabled:opacity-50 hover:bg-indigo-700"
          >
            {phoneSaving ? "Saving…" : "Save phone"}
          </button>
          <span aria-live="polite" className="text-sm">
            {phoneSaved && <span className="text-emerald-600">Saved ✓</span>}
          </span>
        </div>
        {phoneError && (
          <p id="phone-error" role="alert" className="text-sm text-red-600">
            {phoneError}
          </p>
        )}
      </form>
```

- [ ] **Step 5: Run the component tests**

Run: `npx jest tests/unit/SettingsForm.test.tsx`
Expected: all tests pass.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/settings/page.tsx app/settings/SettingsForm.tsx tests/unit/SettingsForm.test.tsx
git commit -m "Add phone section to settings form"
```

---

## Task 6: Signup form — optional phone input

**Files:**
- Modify: `app/join/SignupForm.tsx`
- Modify: `tests/unit/SignupForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/SignupForm.test.tsx`, inside the existing `describe("SignupForm", ...)` block:

```tsx
  it("renders an optional phone input", () => {
    render(<SignupForm initialCode="" />);
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).not.toBeRequired();
  });

  it("omits phone from the request body when left blank", async () => {
    const user = userEvent.setup();
    render(<SignupForm initialCode="" />);
    await user.type(screen.getByLabelText(/name/i), "No Phone");
    await user.type(screen.getByLabelText(/email/i), "nop@example.com");
    await user.type(screen.getByLabelText(/access code/i), "the-code");
    await user.click(screen.getByRole("button", { name: /sign up/i }));
    const call = (global.fetch as jest.Mock).mock.calls.find(
      (c) => c[0] === "/api/auth/signup"
    );
    expect(call).toBeDefined();
    const sent = JSON.parse(call![1].body);
    expect(sent).not.toHaveProperty("phone");
  });

  it("includes the raw phone string in the request body when filled", async () => {
    const user = userEvent.setup();
    render(<SignupForm initialCode="" />);
    await user.type(screen.getByLabelText(/name/i), "With Phone");
    await user.type(screen.getByLabelText(/email/i), "wp@example.com");
    await user.type(screen.getByLabelText(/phone/i), "(555) 123-4567");
    await user.type(screen.getByLabelText(/access code/i), "the-code");
    await user.click(screen.getByRole("button", { name: /sign up/i }));
    const call = (global.fetch as jest.Mock).mock.calls.find(
      (c) => c[0] === "/api/auth/signup"
    );
    expect(call).toBeDefined();
    const sent = JSON.parse(call![1].body);
    expect(sent.phone).toBe("(555) 123-4567");
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx jest tests/unit/SignupForm.test.tsx`
Expected: the three new tests fail (no phone label yet).

- [ ] **Step 3: Modify the signup form**

Edit `app/join/SignupForm.tsx`:

1. Add a `phone` state variable next to the others:

```tsx
  const [phone, setPhone] = useState("");
```

2. Build the body object and send it in `onSubmit`, replacing the current `body: JSON.stringify({ name, email, code })`:

```tsx
      const trimmedPhone = phone.trim();
      const payload: {
        name: string;
        email: string;
        code: string;
        phone?: string;
      } = { name, email, code };
      if (trimmedPhone.length > 0) payload.phone = trimmedPhone;
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
```

3. Add a phone label/input between the Email label and the Access code label in the JSX:

```tsx
      <label className="flex flex-col gap-1 text-sm text-neutral-700">
        <span className="flex items-baseline gap-2">
          Phone
          <span className="text-xs text-neutral-500 font-normal">
            optional — we&apos;ll use this for SMS reminders when that&apos;s added
          </span>
        </span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          aria-invalid={!!error}
          aria-describedby={error ? "signup-error" : undefined}
          className="rounded-md bg-white border border-neutral-300 px-3 py-2 text-neutral-900"
        />
      </label>
```

- [ ] **Step 4: Run the component tests**

Run: `npx jest tests/unit/SignupForm.test.tsx`
Expected: all tests pass.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/join/SignupForm.tsx tests/unit/SignupForm.test.tsx
git commit -m "Add optional phone input to signup form"
```

---

## Task 7: E2E — set, persist, and clear phone from settings

**Files:**
- Modify: `tests/e2e/settings.spec.ts`

Note: we intentionally do **not** add an e2e spec for signup-with-phone. The existing signup e2e is skipped on non-chromium to avoid Supabase auth-email rate-limiting, and the signup-with-phone path is already covered by the integration test added in Task 4 (`api-signup.test.ts`).

- [ ] **Step 1: Append a new phone e2e test**

Append to `tests/e2e/settings.spec.ts`:

```ts
test("member adds, persists, and clears a phone number", async ({
  page,
  authedUser: _authedUser,
}) => {
  await page.goto("/settings");

  const phoneInput = page.getByLabel(/^Phone$/i);
  await expect(phoneInput).toHaveValue("");

  // Fill a human-formatted number and save.
  await phoneInput.fill("(555) 123-4567");
  await page.getByRole("button", { name: /Save phone/i }).click();
  await expect(page.getByText(/Saved ✓/i).first()).toBeVisible();

  // Reload — the server stores the normalized digits; input shows that value.
  await page.reload();
  await expect(page.getByLabel(/^Phone$/i)).toHaveValue("5551234567");

  // Button is disabled until the user edits.
  await expect(page.getByRole("button", { name: /Save phone/i })).toBeDisabled();

  // Clear and save.
  await page.getByLabel(/^Phone$/i).fill("");
  await page.getByRole("button", { name: /Save phone/i }).click();
  await expect(page.getByText(/Saved ✓/i).first()).toBeVisible();

  // Reload — field is empty again.
  await page.reload();
  await expect(page.getByLabel(/^Phone$/i)).toHaveValue("");
});
```

- [ ] **Step 2: Run the e2e spec on chromium only**

Run: `npx playwright test tests/e2e/settings.spec.ts --project=chromium`
Expected: both tests in the file pass (original "updates their display name" + new "adds, persists, and clears a phone number").

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/settings.spec.ts
git commit -m "Add e2e coverage for settings phone field"
```

---

## Final verification

- [ ] **Run the full unit test suite:**

Run: `npx jest`
Expected: all tests pass.

- [ ] **Typecheck:**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Run the full e2e suite (chromium):**

Run: `npx playwright test --project=chromium`
Expected: all specs pass.

- [ ] **Manual smoke (devbox):**

1. `npx supabase start` (if not already running) and `npm run dev`.
2. Open `http://devbox:3000/settings` as a logged-in member. Verify the Phone section renders with helper text, saves, persists through reload, and clears back to empty.
3. Open `http://devbox:3000/join?code=<SIGNUP_CODE>`. Verify the Phone field is present, labeled "optional", and submission without a phone succeeds.
