import { env } from "@/lib/env";

export function siteOrigin(request: Request): string {
  if (env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}

// Request-free variant for places with no Request object (e.g., generateMetadata).
// Returns null if no origin can be resolved — callers should degrade gracefully.
export function getSiteOrigin(): string | null {
  if (env.NEXT_PUBLIC_SITE_URL) {
    return env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/+$/, "")}`;
  }
  return null;
}
