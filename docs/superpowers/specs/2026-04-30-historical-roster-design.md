# Historical roster view — design

## Goal

Allow anyone to view the scoreboard / roster for any game date by visiting a
URL of the form `/d/YYYY-MM-DD`. The page mirrors the home page's scoreboard
but is parameterized on date instead of always rendering today.

The feature has no UI affordance on the home page — `/d/<date>` is purely a
shareable link. Admins can edit RSVPs on any date for housekeeping; ordinary
members can only edit RSVPs for today and future dates; anon viewers see
counts on every date, same as today.

## Non-goals

- No history index page listing past dates.
- No prev/next/picker UI on the home page.
- No new email/notification behavior.
- No nav link from `/`.
- No backfill of old data.
- No changes to email reminder content or HMAC token semantics.

## Routing

- New route: `app/d/[date]/page.tsx`. Param: `YYYY-MM-DD`.
- On render, the date is parsed in `APP_TIMEZONE`. If the format is wrong or
  the calendar date is invalid, the page calls `notFound()` to return 404.
- `/d/<today>` renders the same content as `/`. No redirect — both URLs
  remain valid.
- OG metadata for the page reuses the existing `/og/${date}` route.
- The header shows `formatGameDate(date)` for the viewed date.

## Live vs read-only

A single boolean `isLive` decides whether write controls are shown:

```
isLive = isAdmin OR (date >= today)
```

| Viewer        | Past   | Today | Future |
|---------------|--------|-------|--------|
| Anon          | counts | counts| counts |
| Member        | read   | live  | live   |
| Admin         | live   | live  | live   |

When `!isLive`:

- `RsvpControls` (member self-RSVP block) is not rendered. Members see
  `CountCards` above the `Roster` so counts remain visible.
- The 30s polling interval / visibilitychange listener is not started.
- `ConfirmationBanner` is not rendered.

The `Roster`'s per-row admin status cluster keeps its existing gate
(`admin` prop set when `isAdmin && currentUserId`). Admins are always live,
so the gate stays correct.

## Data layer changes

### `lib/scoreboard.ts`

- Rename `getTodayScoreboard` → `getScoreboard`.
- Rename the `today` option to `date` (just a `YYYY-MM-DD` string; the
  function does not enforce that it is actually today).
- No other behavior changes — the function already queries
  `eq("game_date", opts.today)`.
- Update callers: `app/page.tsx`, `app/api/scoreboard/route.ts`, the new
  `app/d/[date]/page.tsx`.

### `lib/date.ts`

Add `isValidGameDate(dateStr: string): boolean`. It uses Luxon to parse
`YYYY-MM-DD` in `APP_TIMEZONE` and returns whether it round-trips to a real
calendar date. Used for route validation.

### `app/api/scoreboard/route.ts`

- Accept optional `?date=YYYY-MM-DD`. Validate with `isValidGameDate`; on
  bad input return 400. Default to `getToday()` when missing.

### `app/api/rsvp/route.ts` (member self-RSVP)

- Accept `game_date` in the POST body (required). Validate format.
- Look up the game by that date instead of `getToday()`.
- Server-side enforcement: if `game_date < today` and the caller is not an
  admin, return 403. (Defense in depth — the UI already hides the controls.)
- The `GET` handler (HMAC email link) is unchanged: it keys off `game_id`
  from the token payload, which already targets a specific game.

### `app/api/admin/rsvp/route.ts`

- Accept `game_date` in the POST body. Validate format.
- Look up the game by that date instead of `getToday()`.
- No date restriction beyond the existing admin auth check.

## Client wiring

### `app/_components/Scoreboard.tsx`

Add two props:

- `viewDate: string` — the date being viewed (`YYYY-MM-DD`).
- `isLive: boolean` — computed by the page, passed in.

Behavior changes:

- `refresh()` calls `/api/scoreboard?date=${viewDate}`.
- `setPlayerStatus()` (admin) sends `game_date: viewDate` in the POST body.
- `RsvpControls` receives `viewDate` and includes it in its POST body.
- When `!isLive`: skip `RsvpControls`, render `CountCards` above the
  `Roster` for members, skip polling, skip `ConfirmationBanner`.
- The `state === "no-game"` and `state === "cancelled"` branches use
  `viewDate` in their copy: "No game on <formatted date>." instead of
  the current hardcoded "No game today." For the live home page this
  yields "No game on <today's date>" — slightly more verbose, but
  consistent across all dates.

### `app/_components/RsvpControls.tsx`

- Accept `viewDate: string`.
- Include `game_date: viewDate` in its `/api/rsvp` POST body.

### `app/d/[date]/page.tsx`

Mirrors `app/page.tsx` with these differences:

- Reads `params.date`, validates with `isValidGameDate`, calls
  `notFound()` if invalid.
- Computes `isLive = isAdmin || date >= getToday()`.
- Calls `getScoreboard(supabase, { date, includeRoster, includeNonResponders, userId })`.
- Header shows `formatGameDate(date)`.
- Renders `<Scoreboard initial={…} viewDate={date} isLive={isLive} isAdmin={isAdmin} currentUserId={…} />` (no `urlStatus`, no `focusNoteOnMount`).
- OG metadata points at `/og/${date}`.

### `app/page.tsx`

- Pass `viewDate={getToday()}` and `isLive={true}` to `Scoreboard`.

## Testing

### Unit

- `lib/date.test.ts` — `isValidGameDate` accepts `2026-04-30`; rejects
  `foo`, `2026-13-01`, `2026-02-30`, `2026-4-30`, empty string.
- `lib/scoreboard.test.ts` — rename to `getScoreboard`; add a past-date case
  that returns data correctly (the function should be date-agnostic).

### Integration (`tests/integration`)

- `/api/scoreboard?date=<valid>` returns scoreboard for that date.
- `/api/scoreboard?date=invalid` → 400.
- `/api/rsvp` POST without `game_date` → 400.
- `/api/rsvp` POST with `game_date < today` as non-admin → 403.
- `/api/rsvp` POST with `game_date >= today` works for member.
- `/api/admin/rsvp` POST with `game_date` in past works for admin.

### E2E (`tests/e2e/historical-roster.spec.ts`)

- Seed a game on a past date with a few RSVPs.
- `/d/<past>` as anon → counts only, no roster.
- `/d/<past>` as member → roster visible, no `RsvpControls`, no admin
  buttons.
- `/d/<past>` as admin → roster + per-row admin buttons; click one and
  verify it persists.
- `/d/2026-99-99` → 404.
