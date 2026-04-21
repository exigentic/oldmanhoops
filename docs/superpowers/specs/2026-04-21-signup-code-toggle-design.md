# Signup Code Toggle

## Purpose

Make the signup access code optional via an environment variable. When the toggle is off, anyone can sign up without a code; when on, the current gated behavior is preserved. This lets us run an open signup period (e.g. onboarding a new group) without removing or rewriting the code-gate logic.

## Scope

- New env var controlling whether the signup code is required.
- `lib/env.ts` changes to parse the toggle and conditionally require `SIGNUP_CODE`.
- API route `/api/auth/signup` skips code validation when the toggle is off.
- `/join` page and `SignupForm` hide the access-code input when the toggle is off.
- `.env.example` documents the new var.
- Unit and e2e tests cover both modes.

Out of scope: disabling signups entirely (separate concern), admin UI to flip the toggle, any `NEXT_PUBLIC_*` exposure of gate state.

## Env surface

New variable:

```
SIGNUP_CODE_REQUIRED=true|false
```

- Parsed as `process.env.SIGNUP_CODE_REQUIRED === "true"`. Anything else (unset, empty, `"false"`, `"0"`, etc.) means disabled.
- Default when missing: **disabled** (open signups).
- `SIGNUP_CODE` becomes conditionally required:
  - If `SIGNUP_CODE_REQUIRED === true` and `SIGNUP_CODE` is unset → env load throws `Missing required env var: SIGNUP_CODE (required when SIGNUP_CODE_REQUIRED=true)`.
  - If `SIGNUP_CODE_REQUIRED !== true`, `SIGNUP_CODE` may be absent; `env.SIGNUP_CODE` is `undefined`.

## `lib/env.ts`

Add:

```ts
SIGNUP_CODE_REQUIRED: process.env.SIGNUP_CODE_REQUIRED === "true",
```

Change `SIGNUP_CODE` from unconditional `require_` to a conditional load. Shape becomes `string | undefined`. When `SIGNUP_CODE_REQUIRED` is true, validate presence with a clear error message; otherwise pass through.

The resulting `env` type:

- `SIGNUP_CODE_REQUIRED: boolean`
- `SIGNUP_CODE: string | undefined`

Consumers that still need the code string (the API route) must guard with `env.SIGNUP_CODE_REQUIRED` before using `env.SIGNUP_CODE`.

## API route (`app/api/auth/signup/route.ts`)

- When `env.SIGNUP_CODE_REQUIRED` is true: unchanged behavior. Require `email`, `name`, and `code`. Validate `code` against `env.SIGNUP_CODE` with `validateSignupCode`; on mismatch return 401.
- When false: require only `email` and `name`. Do not read `code` from the body. Do not call `validateSignupCode`.

Error responses:

- Missing required field (varies by mode): 400 `"email and name are required"` (disabled) or `"email, name, and code are required"` (enabled).
- Invalid code (enabled only): 401 `"Invalid signup code"`.

## `/join` page and `SignupForm`

`app/join/page.tsx` is a server component. It reads `env.SIGNUP_CODE_REQUIRED` and passes a new prop:

```tsx
<SignupForm initialCode={code ?? ""} signupCodeRequired={env.SIGNUP_CODE_REQUIRED} />
```

Page header description swaps based on the toggle:

- Enabled: `"Enter the group's access code to request a sign-in link."`
- Disabled: `"Request a sign-in link."`

`SignupForm` changes:

- New prop: `signupCodeRequired: boolean`.
- When `false`: the access-code `<label>`/`<input>` is not rendered. The `code` field is omitted from the request body (send only `{ name, email }`).
- When `true`: current behavior.
- `initialCode` is always accepted but only used when `signupCodeRequired` is `true` (when disabled, a `?code=` URL param is silently ignored).

## `.env.example`

Add between the existing `SIGNUP_CODE` line and the following var:

```
# When "true", /join requires SIGNUP_CODE. When unset or any other value,
# signups are open and SIGNUP_CODE is not required.
SIGNUP_CODE_REQUIRED=false

# Signup access code (min 12 chars, URL-safe random via openssl rand -base64 12)
# Only required when SIGNUP_CODE_REQUIRED=true.
SIGNUP_CODE=replace_with_12_plus_chars
```

## Tests

### `tests/unit/env.test.ts`

Add:

- `SIGNUP_CODE_REQUIRED="true"` with `SIGNUP_CODE` set → `env.SIGNUP_CODE_REQUIRED === true`, `env.SIGNUP_CODE` matches.
- `SIGNUP_CODE_REQUIRED="true"` without `SIGNUP_CODE` → throws `/SIGNUP_CODE/`.
- `SIGNUP_CODE_REQUIRED` unset, `SIGNUP_CODE` unset → `env.SIGNUP_CODE_REQUIRED === false`, `env.SIGNUP_CODE === undefined`, does not throw.
- `SIGNUP_CODE_REQUIRED="false"` → `env.SIGNUP_CODE_REQUIRED === false` (explicit false).

### `tests/unit/api-signup.test.ts`

Split into two describe blocks. Each block sets/unsets `process.env.SIGNUP_CODE_REQUIRED` and re-imports the route via `jest.resetModules()` + dynamic `require`.

- **Enabled mode** (`SIGNUP_CODE_REQUIRED=true`): existing tests — rejects bad code (401), rejects missing email (400), accepts valid signup (200).
- **Disabled mode** (`SIGNUP_CODE_REQUIRED` unset): accepts signup with no `code` field (200), rejects missing email (400), does **not** reject when `code` is wrong (bad codes are simply ignored, returns 200).

### `tests/unit/SignupForm.test.tsx`

- Update existing tests to pass `signupCodeRequired={true}` explicitly.
- Add: `signupCodeRequired={false}` → access-code input is not in the document.
- Add: `signupCodeRequired={false}` → submitting calls fetch with a body that has no `code` key.

### `tests/e2e/signup.spec.ts`

Branch based on `process.env.SIGNUP_CODE_REQUIRED`:

- When `"true"`: existing happy path (prefilled code via `?code=`, submit, OTP step).
- Otherwise: load `/join`, assert access-code field is absent, fill name + email, submit, assert OTP step.

## Non-goals

- No `NEXT_PUBLIC_*` variant — the toggle stays server-side.
- No admin UI.
- No changes to the OTP/invite flow after successful signup.
- No rate-limiting or abuse mitigation added at this layer (separate concern).
