import { env } from "@/lib/env";

export function siteOrigin(request: Request): string {
  if (env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}
