# Phone Number Field

## Purpose

Allow members to save a phone number on their profile, even though SMS reminders are not yet sent. This lets us start collecting numbers now so that when SMS reminders ship, we don't have to prompt every existing member. Both new signups and existing members can add a phone.

## Scope

- New shared normalization helper.
- Settings page: add/edit/clear phone number.
- Signup form: optional phone number at account creation.
- Trigger update so that a phone provided at invite time is copied into `players`.

Out of scope: sending SMS, per-number verification, country code UI picker, formatting the stored value for display (we store and show the normalized digits form).

## Normalization

New file `lib/phone.ts` exports:

```ts
class InvalidPhoneError extends Error {}

function normalizePhone(raw: string | null | undefined): string | null;
```

Rules:

- `null`, `undefined`, or a string that trims to empty → return `null`.
- Otherwise strip these characters from the input: spaces, `-`, `(`, `)`, `.`.
- The remaining string must match `/^\+?\d{10,15}$/` (optional leading `+`, then 10–15 digits). If not, throw `InvalidPhoneError` with message `"Phone must be 10–15 digits"`.
- Return the matched string as-is (leading `+` preserved if present).

Examples:

| Input | Output |
| --- | --- |
| `""` / `"   "` / `null` / `undefined` | `null` |
| `"(555) 123-4567"` | `"5551234567"` |
| `"555-123-4567"` | `"5551234567"` |
| `"+1 555.123.4567"` | `"+15551234567"` |
| `"555-1234"` (too short) | throws |
| `"call me maybe"` | throws |

This same helper is the single source of truth for all current and future phone input.

## Database

No column or type change — `players.phone text` already exists and is nullable.

New migration: `supabase/migrations/<timestamp>_handle_new_user_phone.sql` replaces the `handle_new_user` function so that a phone passed in `raw_user_meta_data` is copied into the new row:

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

The existing trigger `on_auth_user_created` continues to fire this function.

## API

### `POST /api/profile`

Extend `ProfileBody` with `phone?: string | null`.

Behavior when `phone` is present in the body:

- `null` or a string that trims to empty → set `phone = null` in the update.
- Otherwise call `normalizePhone(body.phone)`. On `InvalidPhoneError`, return `400 { error: "Phone must be 10–15 digits" }`. On success, write the normalized value.
- Must coexist with other fields in the same request (caller may send only phone, or phone + name, etc.).

Response and auth semantics are unchanged.

### `POST /api/auth/signup`

Extend `SignupBody` with `phone?: string`.

- If `phone` is absent, empty, or whitespace-only, the caller is treated as not providing a phone (skipped entirely — do **not** write `phone: null` into user metadata; omit the key).
- If `phone` is a non-empty string, run `normalizePhone`. On `InvalidPhoneError`, return `400 { error: "Phone must be 10–15 digits" }`.
- On success, include the normalized string in the `data` object passed to `supabase.auth.admin.inviteUserByEmail(email, { data: { name, phone } })`. The trigger (above) picks it up.

## UI

### Settings (`app/settings/SettingsForm.tsx` + `app/settings/page.tsx`)

Settings page selects `phone` alongside the other columns and passes `initialPhone: string | null` into `SettingsForm`.

New "Phone" section in `SettingsForm`, modeled on the existing "Name" section:

- Label: `Phone`.
- Helper text under label: *"Optional — we'll use this for SMS reminders when that's added."*
- Input: `<input type="tel" autoComplete="tel">`, pre-filled with `initialPhone ?? ""`.
- Save button disabled when the trimmed input equals the last saved value (so you can't save the same value twice and can't save a never-changed field).
- Empty-and-save clears the value (sends `{ phone: null }` to the API).
- Uses the same `useFlashValue` "Saved ✓" pattern and inline error rendering as the Name section.
- On save success, update local "last saved" state so the button re-disables until the user edits again.

The section sits after Name and before Email, so the visual order is: Name → Phone → Email → Toggles.

### Signup (`app/join/SignupForm.tsx`)

Add a phone input between the Email field and the Access code field:

- Label: `Phone`.
- Helper text: *"Optional — we'll use this for SMS reminders when that's added."* (same wording as settings)
- `<input type="tel" autoComplete="tel">`, not `required`.
- Value held in local state. On submit, the trimmed value is included in the request body only if non-empty; otherwise the `phone` key is omitted.
- On server validation error, the existing error display already handles the shape (error string shown under the form).

## Tests

- **Unit — `tests/unit/phone.test.ts`:** table-driven coverage of `normalizePhone` — empties → `null`, common human formats → digits, `+`-prefix passes through, short/long/non-digit inputs throw `InvalidPhoneError`.
- **Unit — `tests/unit/schema.test.ts`:** no change expected; `phone` is already in the column list. Verify the test still passes after the trigger migration.
- **API — extend `/api/profile` tests (or add if none):** phone set from empty, phone cleared via `null`, phone cleared via `""`, invalid phone → 400, phone alongside name in the same request.
- **API — extend `/api/auth/signup` tests (or add if none):** signup without phone (absent key), signup with valid phone (normalized on the way in), signup with invalid phone → 400.
- **E2E — Playwright:**
  - Settings spec: fill phone, save, reload, assert persisted; clear phone, save, reload, assert gone.
- **Signup-with-phone coverage lives in the signup API integration test** (`tests/unit/api-signup.test.ts`) rather than an e2e spec. The existing signup e2e is skipped on non-chromium to avoid Supabase auth-email rate-limiting, and an integration test that calls the route and then queries `players.phone` via an admin client covers the same end-to-end path (route → invite metadata → trigger → row) without consuming the rate-limit budget.

## Rollout

- No backfill; existing rows keep `phone = null`.
- No flag needed; phone is optional end-to-end so there is nothing to gate.

## Non-goals / future work

- Sending SMS (covered by the eventual SMS-reminder feature).
- Per-number verification / OTP.
- Displaying phone anywhere outside settings.
- Country-code selection or international-aware formatting UI. If SMS ships US-only, `+1` can be prepended to 10-digit entries at send time.
