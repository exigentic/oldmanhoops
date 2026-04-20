import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Returns `null` if the request has a valid Bearer CRON_SECRET header,
 * otherwise a 401 JSON response to return from the caller.
 */
export function requireCronAuth(request: Request): Response | null {
  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
