# Daily Open Graph Image

## Purpose

When a link to Old Man Hoops is shared in Slack, iMessage, WhatsApp, etc., the preview card should show today's "IN" and "MAYBE" counts so people can decide at a glance whether there's a game on.

## Scope

- A dynamic PNG endpoint that renders a 1200×630 Open Graph card for a given date.
- Metadata wiring on the home page so shared links reference today's card.
- Three display states: scheduled (with counts), no-game, cancelled.

Out of scope: per-link customization, sharing other pages, animation, multi-language labels.

## Visual Design

Approved mock: logo left, counts right.

- **Canvas:** 1200×630, background `#fafaf9`.
- **Left column (380px wide):**
  - `omh.svg` centered, 220px wide.
  - Date in navy (`#1f438b`), `MM/DD/YYYY`, 34px weight 800, tabular numerals, 22px gap below the logo.
- **Right column:** 1px left border `#e5e7eb`, padding 52px/64px.
  - "Old Man Hoops" — 32px, weight 900, color `#1f438b`.
  - Stats block, vertical gap 14px:
    - **IN row** (scheduled): `{count}` at 200px weight 900, letter-spacing −6px, color `#1f438b`; "IN" label at 62px weight 800, letter-spacing 3px, same color.
    - **MAYBE row** (scheduled): `{count}` at 150px (~75% of IN), color `#c9102e`; "MAYBE" label at 46px, same color.
  - **No-game state:** replace stats block with "No game today" — 56px weight 800, color `#374151`.
  - **Cancelled state:** replace stats block with "Cancelled" — 140px weight 900 `#c9102e`; reason (if present) below at 28px `#374151`, up to 2 lines with ellipsis.

Numeric fields display the raw integer, no padding, no plus sign.

## Architecture

### Route

`app/og/[date]/route.tsx` — a `GET` handler using `next/og`'s `ImageResponse`.

- Validates `date` param against `/^\d{4}-\d{2}-\d{2}$/`. Invalid → 400 text response.
- Parses the date with Luxon in `APP_TIMEZONE` to format `MM/DD/YYYY`.
- Fetches state via `getOgCounts`.
- Renders the card JSX and returns the image.
- Response headers:
  - `Content-Type: image/png` (set by `ImageResponse`).
  - `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

### Data helper

`lib/og.ts` exports `getOgCounts(supabase, date): Promise<OgCardData>` where:

```ts
type OgCardData =
  | { state: "no-game" }
  | { state: "cancelled"; reason: string | null }
  | { state: "scheduled"; in: number; maybe: number };
```

Implementation mirrors `getTodayScoreboard` but:
- Takes an arbitrary `date` (not just today).
- Does **not** join `players` (RLS on `players` requires authentication; the OG route runs anonymous).
- Sums `in` and `maybe` counts including guest pluses the same way as `getTodayScoreboard` (each status row contributes `1 + guests`).
- Ignores `out` rows.

The OG route uses `createClient` from `@supabase/supabase-js` directly with the anon key (no cookie/session context needed). This keeps the route independent of the authenticated server client and its cookie machinery.

### Logo embedding

`public/omh.svg` is read once at module load via `fs.readFileSync` and embedded in the card as a data URL. The file is tiny (~5KB). No font loading is needed — a default sans-serif stack suffices for the numerals and labels at the sizes used.

### Metadata wiring

`app/page.tsx` switches from an implicit root metadata to an explicit `generateMetadata()` that:
- Computes today via `getToday()`.
- Computes an absolute URL: `${siteOrigin}/og/${today}`. `siteOrigin` comes from `NEXT_PUBLIC_SITE_URL` if set, otherwise falls back to a `VERCEL_URL` check, otherwise omits the OG image (graceful degradation in local dev).
- Sets `openGraph.title`, `openGraph.description`, `openGraph.images: [{ url, width: 1200, height: 630, alt }]`, and a mirrored `twitter` card with `card: "summary_large_image"`.

No `.png` suffix in the URL — the route file is a standard App Router route and returns an image regardless of extension.

## Data Flow

1. Crawler fetches `/`.
2. Server renders page metadata with `og:image` = `https://oldmanhoops.example.com/og/2026-04-21`.
3. Crawler fetches `/og/2026-04-21`.
4. Route handler parses date, runs `getOgCounts` against anon Supabase, renders PNG, returns with `s-maxage=60`.
5. Next day, home page's metadata now points at `/og/2026-04-22`, which is a cold URL for crawlers — fresh numbers guaranteed on new shares.

## Error Handling

- Invalid date param → HTTP 400 plain text.
- Database error → log and return HTTP 500 plain text. Do not attempt a fallback image. A missing OG image on a share is visibly less broken than a placeholder with wrong counts.
- Missing `NEXT_PUBLIC_SITE_URL` and `VERCEL_URL` → `generateMetadata` omits the OG image entry entirely rather than emitting a relative URL (which crawlers can't resolve).

## Testing

### Unit — `tests/unit/og-counts.test.ts`

- Returns `{ state: "no-game" }` when no `games` row exists for the date.
- Returns `{ state: "cancelled", reason }` when `games.status = 'cancelled'`.
- Returns `{ state: "scheduled", in, maybe }` when a game exists, with correct sums including `guests`.
- `out` rows do not affect `in` or `maybe` totals.

Use the same supabase-mock pattern already used in `tests/unit/scoreboard.test.ts`.

### Route — `tests/unit/og-route.test.ts`

- `GET /og/2026-04-21` with mocked supabase returns status 200 and `Content-Type: image/png`.
- `GET /og/not-a-date` returns 400.
- `Cache-Control` header includes `s-maxage=60` and `stale-while-revalidate=300`.

Pixel-level snapshots are intentionally skipped.

### Manual verification

After deploy, paste the home URL into a Slack message and confirm the preview shows today's counts. Re-check the next day to confirm the URL rolls forward.

## File Changes

- **New:** `app/og/[date]/route.tsx` — route handler.
- **New:** `lib/og.ts` — `getOgCounts` + card component.
- **New:** `tests/unit/og-counts.test.ts` — unit tests for the data helper.
- **New:** `tests/unit/og-route.test.ts` — route tests.
- **Edit:** `app/page.tsx` — add `generateMetadata`.
- **Edit:** `lib/site-url.ts` — expose a request-free `getSiteOrigin()` (reads `NEXT_PUBLIC_SITE_URL` / `VERCEL_URL`) for use in `generateMetadata`, alongside the existing request-based helper.

## Non-Goals

- Guest-count breakdown in the image.
- Per-user customization ("you are IN") — this is a shareable public card.
- Roster names — intentionally omitted; counts are the share hook.
