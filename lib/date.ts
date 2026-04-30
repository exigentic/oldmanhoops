import { DateTime } from "luxon";

// APP_TIMEZONE is a server-only env var (not NEXT_PUBLIC_*). On the server
// it is required — fail fast if missing. In the browser bundle the var is
// undefined and we fall back to UTC; the only client caller is
// `formatGameDate`, which formats date-only inputs whose calendar fields are
// independent of zone, so the fallback is safe there.
function resolveAppTimezone(): string {
  if (typeof window !== "undefined") return "UTC";
  const tz = process.env.APP_TIMEZONE;
  if (!tz) throw new Error("Missing required env var: APP_TIMEZONE");
  return tz;
}

const APP_TIMEZONE: string = resolveAppTimezone();

export function getToday(now: Date = new Date(), zone: string = APP_TIMEZONE): string {
  const dt = DateTime.fromJSDate(now, { zone });
  return dt.toFormat("yyyy-MM-dd");
}

export function formatGameDate(dateStr: string, zone: string = APP_TIMEZONE): string {
  const dt = DateTime.fromFormat(dateStr, "yyyy-MM-dd", { zone });
  return dt.toFormat("EEEE, MMMM d");
}

export function isGameDay(dateStr: string, zone: string = APP_TIMEZONE): boolean {
  const dt = DateTime.fromFormat(dateStr, "yyyy-MM-dd", { zone });
  // Luxon: 1 = Monday, 7 = Sunday
  return dt.weekday >= 1 && dt.weekday <= 5;
}

export function getLocalHour(now: Date = new Date(), zone: string = APP_TIMEZONE): number {
  return DateTime.fromJSDate(now, { zone }).hour;
}

export function isValidGameDate(dateStr: string, zone: string = APP_TIMEZONE): boolean {
  if (typeof dateStr !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const dt = DateTime.fromFormat(dateStr, "yyyy-MM-dd", { zone });
  return dt.isValid && dt.toFormat("yyyy-MM-dd") === dateStr;
}
