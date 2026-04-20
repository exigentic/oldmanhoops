import { DateTime } from "luxon";
import { env } from "@/lib/env";

export function getToday(now: Date = new Date(), zone: string = env.APP_TIMEZONE): string {
  const dt = DateTime.fromJSDate(now, { zone });
  return dt.toFormat("yyyy-MM-dd");
}

export function formatGameDate(dateStr: string, zone: string = env.APP_TIMEZONE): string {
  const dt = DateTime.fromFormat(dateStr, "yyyy-MM-dd", { zone });
  return dt.toFormat("EEEE, MMMM d");
}
