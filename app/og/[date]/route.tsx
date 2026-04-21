import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { DateTime } from "luxon";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { getOgCounts, type OgCardData } from "@/lib/og";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const logoDataUrl = (() => {
  const svg = readFileSync(path.join(process.cwd(), "public", "omh.svg"), "utf8");
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
})();

const NAVY = "#1f438b";
const RED = "#c9102e";
const BG = "#fafaf9";
const BORDER = "#e5e7eb";
const MUTED = "#374151";

function formatDateMDY(date: string): string {
  const dt = DateTime.fromFormat(date, "yyyy-MM-dd", { zone: env.APP_TIMEZONE });
  return dt.toFormat("MM/dd/yyyy");
}

function card(date: string, data: OgCardData) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: BG,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#111827",
      }}
    >
      <div
        style={{
          width: 380,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 48px",
          gap: 22,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoDataUrl} width={220} alt="" style={{ display: "block" }} />
        <div
          style={{
            fontSize: 34,
            fontWeight: 800,
            color: NAVY,
            letterSpacing: 1,
          }}
        >
          {formatDateMDY(date)}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          borderLeft: `1px solid ${BORDER}`,
          padding: "52px 64px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 900,
            color: NAVY,
            letterSpacing: 0.3,
            marginBottom: 18,
          }}
        >
          Old Man Hoops
        </div>

        {data.state === "scheduled" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
              <div
                style={{
                  fontSize: 200,
                  fontWeight: 900,
                  color: NAVY,
                  letterSpacing: -6,
                  lineHeight: 0.82,
                }}
              >
                {data.in}
              </div>
              <div
                style={{
                  fontSize: 62,
                  fontWeight: 800,
                  color: NAVY,
                  letterSpacing: 3,
                }}
              >
                IN
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 22 }}>
              <div
                style={{
                  fontSize: 150,
                  fontWeight: 900,
                  color: RED,
                  letterSpacing: -4.5,
                  lineHeight: 0.82,
                }}
              >
                {data.maybe}
              </div>
              <div
                style={{
                  fontSize: 46,
                  fontWeight: 800,
                  color: RED,
                  letterSpacing: 3,
                }}
              >
                MAYBE
              </div>
            </div>
          </div>
        ) : data.state === "cancelled" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                fontSize: 140,
                fontWeight: 900,
                color: RED,
                letterSpacing: -4,
                lineHeight: 0.9,
              }}
            >
              Cancelled
            </div>
            {data.reason ? (
              <div
                style={{
                  fontSize: 28,
                  color: MUTED,
                  maxWidth: 620,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {data.reason}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: MUTED,
            }}
          >
            No game today
          </div>
        )}
      </div>
    </div>
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ date: string }> }
): Promise<Response> {
  const { date } = await ctx.params;
  if (!DATE_RE.test(date)) {
    return new Response("invalid date", { status: 400 });
  }

  const supabase = createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const data = await getOgCounts(supabase, date);

  const img = new ImageResponse(card(date, data), {
    width: 1200,
    height: 630,
  });

  const headers = new Headers(img.headers);
  headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return new Response(img.body, { status: img.status, headers });
}
