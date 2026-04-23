# Admin Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `players.is_admin` boolean flag, a server-side helper to check the current user's admin status, and a visible "Admin" badge on the settings page — without adding any admin capability.

**Architecture:** Single migration adds `is_admin boolean NOT NULL DEFAULT false` to `public.players`. A new `lib/auth/admin.ts` exports `isCurrentUserAdmin(supabase)` that calls `auth.getUser()` and reads `is_admin` from the player row, failing closed on any error. The settings page fetches `is_admin` alongside its existing columns and conditionally renders a small pill next to the page heading. No RLS changes, no `handle_new_user` changes, no env-var-driven seeding — admins are set manually via SQL.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + auth), Tailwind v4, Jest (node env, `maxWorkers: 1`, real local Supabase for integration-style unit tests), `supabase` CLI for migrations.

**Spec reference:** `docs/superpowers/specs/2026-04-23-admin-role-design.md`

**Pre-flight:**
- Local Supabase must be running (`supabase start`). Confirm with `supabase status` — Postgres should be reachable on `postgresql://postgres:postgres@127.0.0.1:55322/postgres`.
- `.env.local` must be present (contains `SUPABASE_DB_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.). Jest reads it via `jest.setup-env.ts`.

---

## File Structure

Files created or modified in this plan:

- **Create** `supabase/migrations/<generated-timestamp>_add_is_admin.sql` — one-line `ALTER TABLE` that adds the column.
- **Create** `lib/auth/admin.ts` — exports `isCurrentUserAdmin(supabase: SupabaseClient): Promise<boolean>`. Single-responsibility, no other exports.
- **Create** `tests/unit/auth-admin.test.ts` — unit tests for the helper using a hand-rolled stub of the `SupabaseClient` shape (no real DB needed — the helper's logic is what we're testing, and the `.from(...).select(...).eq(...).single()` chain is well-defined by `@supabase/supabase-js` types).
- **Modify** `tests/unit/schema.test.ts:32-40` — add `"is_admin"` to the expected `players` column list.
- **Modify** `app/settings/page.tsx` — add `is_admin` to the select list (line 20), add the pill markup in the header block (lines 31-39).

---

## Task 1: Schema — add `is_admin` column

**Files:**
- Create: `supabase/migrations/<generated-timestamp>_add_is_admin.sql`
- Modify: `tests/unit/schema.test.ts:32-40`

- [ ] **Step 1.1: Update the schema test to expect `is_admin`**

Edit `tests/unit/schema.test.ts`. Replace the array in the `has players table with expected columns` test (lines 32-40) so `"is_admin"` is included in the expected order. The `ALTER TABLE ... ADD COLUMN` migration appends to the end of the table, so `is_admin` comes after `created_at`:

```ts
    expect(names).toEqual([
      "id",
      "name",
      "phone",
      "reminder_email",
      "reminder_sms",
      "active",
      "created_at",
      "is_admin",
    ]);
```

- [ ] **Step 1.2: Run the schema test and verify it fails**

Run: `npx jest tests/unit/schema.test.ts -t "has players table with expected columns"`

Expected: FAIL with a diff showing `is_admin` is missing from the actual column list.

- [ ] **Step 1.3: Generate the migration file**

Run: `supabase migration new add_is_admin`

Expected: creates an empty file at `supabase/migrations/<YYYYMMDDHHMMSS>_add_is_admin.sql`. Note the generated path — the rest of the task refers to it as `<migration-file>`.

- [ ] **Step 1.4: Write the migration SQL**

Write this exact content to the new migration file:

```sql
ALTER TABLE public.players
  ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
```

- [ ] **Step 1.5: Apply the migration to the local database**

Run: `supabase migration up`

Expected: output includes "Applying migration `<timestamp>_add_is_admin.sql`" and no errors.

If `supabase migration up` reports no new migrations (because of a local state mismatch), fall back to: `supabase db reset` — this rebuilds the local DB from scratch applying all migrations. That wipes seed data, which is acceptable at this stage (no production data is touched; local only).

- [ ] **Step 1.6: Run the schema test and verify it passes**

Run: `npx jest tests/unit/schema.test.ts -t "has players table with expected columns"`

Expected: PASS.

- [ ] **Step 1.7: Run the full schema test file to confirm nothing else regressed**

Run: `npx jest tests/unit/schema.test.ts`

Expected: all tests PASS (no other test in that file asserts on the players column list).

- [ ] **Step 1.8: Commit**

```bash
git add supabase/migrations/<migration-file> tests/unit/schema.test.ts
git commit -m "Add players.is_admin column"
```

---

## Task 2: Helper — `isCurrentUserAdmin`

**Files:**
- Create: `lib/auth/admin.ts`
- Create: `tests/unit/auth-admin.test.ts`

- [ ] **Step 2.1: Write the failing test file**

Create `tests/unit/auth-admin.test.ts` with this exact content:

```ts
/** @jest-environment node */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCurrentUserAdmin } from "@/lib/auth/admin";

type PlayerRow = { is_admin: boolean } | null;
type QueryResult = { data: PlayerRow; error: unknown };

function makeClient(
  user: { id: string } | null,
  queryResult: QueryResult = { data: null, error: null },
): SupabaseClient {
  const singleResult = async (): Promise<QueryResult> => queryResult;
  const eqChain = { single: singleResult };
  const selectChain = { eq: () => eqChain };
  const fromChain = { select: () => selectChain };
  const fake = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => fromChain,
  };
  return fake as unknown as SupabaseClient;
}

describe("isCurrentUserAdmin", () => {
  it("returns false when no user is logged in", async () => {
    const client = makeClient(null);
    await expect(isCurrentUserAdmin(client)).resolves.toBe(false);
  });

  it("returns false when the user's player row has is_admin = false", async () => {
    const client = makeClient(
      { id: "user-1" },
      { data: { is_admin: false }, error: null },
    );
    await expect(isCurrentUserAdmin(client)).resolves.toBe(false);
  });

  it("returns true when the user's player row has is_admin = true", async () => {
    const client = makeClient(
      { id: "user-1" },
      { data: { is_admin: true }, error: null },
    );
    await expect(isCurrentUserAdmin(client)).resolves.toBe(true);
  });

  it("returns false when the player row is missing (data = null)", async () => {
    const client = makeClient(
      { id: "user-1" },
      { data: null, error: null },
    );
    await expect(isCurrentUserAdmin(client)).resolves.toBe(false);
  });

  it("returns false when the query returns an error", async () => {
    const client = makeClient(
      { id: "user-1" },
      { data: null, error: new Error("boom") },
    );
    await expect(isCurrentUserAdmin(client)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2.2: Run the test and verify it fails**

Run: `npx jest tests/unit/auth-admin.test.ts`

Expected: FAIL with a module-resolution error ("Cannot find module '@/lib/auth/admin'"). The test file itself is syntactically valid; the failure is specifically about the missing implementation module.

- [ ] **Step 2.3: Create the helper**

Create `lib/auth/admin.ts` with this exact content:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function isCurrentUserAdmin(
  supabase: SupabaseClient,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("players")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (error || !data) return false;
  return data.is_admin === true;
}
```

- [ ] **Step 2.4: Run the test and verify it passes**

Run: `npx jest tests/unit/auth-admin.test.ts`

Expected: all 5 tests PASS.

- [ ] **Step 2.5: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 2.6: Commit**

```bash
git add lib/auth/admin.ts tests/unit/auth-admin.test.ts
git commit -m "Add isCurrentUserAdmin helper"
```

---

## Task 3: Settings page — render "Admin" badge

**Files:**
- Modify: `app/settings/page.tsx:20` (select list)
- Modify: `app/settings/page.tsx:31-39` (header block — add the badge)

No test is added for this step per the spec (trivial conditional render, no user-facing flow to set the flag). Verification is manual via the dev server.

- [ ] **Step 3.1: Add `is_admin` to the select list**

In `app/settings/page.tsx`, change line 20 from:

```ts
    .select("name, phone, reminder_email, active")
```

to:

```ts
    .select("name, phone, reminder_email, active, is_admin")
```

- [ ] **Step 3.2: Render the badge in the header**

In `app/settings/page.tsx`, replace the existing header block (lines 31-39):

```tsx
      <header className="flex items-center gap-4">
        <Image src="/omh.svg" alt="" width={56} height={56} />
        <div className="flex flex-col leading-tight">
          <h1 className="text-2xl font-bold text-indigo-700">Settings</h1>
          <Link href="/" className="text-sm text-neutral-600 hover:underline">
            ← Back to scoreboard
          </Link>
        </div>
      </header>
```

with:

```tsx
      <header className="flex items-center gap-4">
        <Image src="/omh.svg" alt="" width={56} height={56} />
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-indigo-700">Settings</h1>
            {player?.is_admin === true && (
              <span className="rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5">
                Admin
              </span>
            )}
          </div>
          <Link href="/" className="text-sm text-neutral-600 hover:underline">
            ← Back to scoreboard
          </Link>
        </div>
      </header>
```

- [ ] **Step 3.3: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors. (The `player` object's inferred type now includes `is_admin: boolean` automatically from the updated select.)

- [ ] **Step 3.4: Run the full test suite**

Run: `npm test`

Expected: all tests PASS. (Nothing in the test suite renders the settings page, so no test changes are required for this task. This run is the "nothing else broke" checkpoint.)

- [ ] **Step 3.5: Manual verification in the dev server**

Start the dev server if it isn't running:

```bash
npm run dev
```

Remember: the dev box serves on `http://devbox:3000`, not localhost.

In a separate shell, manually flip the flag for your own user. First find the user id:

```bash
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -c \
  "SELECT id, name FROM public.players;"
```

Pick your row's `id` and run (substitute the uuid):

```bash
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -c \
  "UPDATE public.players SET is_admin = true WHERE id = '<your-uuid>';"
```

Log in to the app as that user and visit `http://devbox:3000/settings`. Expected: the "Admin" pill appears to the right of the "Settings" heading.

Then flip it back off:

```bash
psql postgresql://postgres:postgres@127.0.0.1:55322/postgres -c \
  "UPDATE public.players SET is_admin = false WHERE id = '<your-uuid>';"
```

Reload `/settings`. Expected: the pill is gone.

- [ ] **Step 3.6: Commit**

```bash
git add app/settings/page.tsx
git commit -m "Show Admin badge on settings page for admins"
```

---

## Task 4: Final verification

- [ ] **Step 4.1: Run the full test suite**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 4.2: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4.3: Production build**

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 4.4: Confirm no extra files are staged or dirty**

Run: `git status`

Expected: `working tree clean` (or only files you intentionally didn't commit). No stray `tmp/` artifacts inside committed paths.

---

## Rollout notes (post-merge)

After this lands on `main` and deploys:

1. In the production Supabase, find your user id: `SELECT id FROM public.players WHERE id = (SELECT id FROM auth.users WHERE email = 'clay@pfd.net');`
2. Promote yourself: `UPDATE public.players SET is_admin = true WHERE id = '<uuid>';`
3. Load `https://www.oldmanhoops.net/settings` and confirm the badge appears.

No other env-var or config changes are required.
