import { DateTime } from "luxon";

// APP_TIMEZONE is a server-only env var (not NEXT_PUBLIC_*). In the browser
// bundle it resolves to undefined, so we fall back to UTC. All functions that
// require the real app timezone are either server-only (getToday, isGameDay,
// getLocalHour) or receive an explicit zone at call-sites where it matters.
const APP_TIMEZONE: string =
  typeof process !== "undefined" && process.env?.APP_TIMEZONE
    ? process.env.APP_TIMEZONE
    : "UTC";

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
