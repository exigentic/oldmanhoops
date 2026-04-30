import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { formatGameDate, getToday, isValidGameDate } from "@/lib/date";
import { getScoreboard } from "@/lib/scoreboard";
import { isCurrentUserAdmin } from "@/lib/auth/admin";
import { Scoreboard } from "@/app/_components/Scoreboard";
import { getSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  const origin = getSiteOrigin();
  const base: Metadata = {
    title: "Old Man Hoops",
    description: "Daily pickup basketball RSVP",
  };
  if (!origin || !isValidGameDate(date)) return base;

  const ogUrl = `${origin}/og/${date}`;
  return {
    ...base,
    openGraph: {
      title: "Old Man Hoops",
      description: "Daily pickup basketball RSVP",
      images: [{ url: ogUrl, width: 1200, height: 630, alt: "Old Man Hoops — RSVP counts" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Old Man Hoops",
      description: "Daily pickup basketball RSVP",
      images: [ogUrl],
    },
  };
}

export default async function HistoricalScoreboard({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isValidGameDate(date)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = user ? await isCurrentUserAdmin(supabase) : false;
  const today = getToday();
  const isLive = isAdmin || date >= today;

  const initial = await getScoreboard(supabase, {
    date,
    includeRoster: !!user,
    includeNonResponders: isAdmin,
    userId: user?.id,
  });

  return (
    <main className="min-h-screen flex flex-col items-center bg-stone-300 text-neutral-900 p-6 pt-8 gap-6">
      <header className="flex items-center gap-4">
        <Image src="/omh.svg" alt="" width={56} height={56} />
        <div className="flex flex-col leading-tight">
          <h1 className="text-2xl font-bold text-indigo-700">Old Man Hoops</h1>
          <p className="text-sm text-neutral-600">M-F, Noon @ One Athletics</p>
          <p className="text-sm text-neutral-600 mt-0.5">{formatGameDate(date)}</p>
        </div>
      </header>

      <div className="w-full max-w-lg flex flex-col items-center gap-6">
        <Scoreboard
          initial={initial}
          viewDate={date}
          isLive={isLive}
          isAdmin={isAdmin}
          currentUserId={user?.id ?? null}
        />
      </div>
    </main>
  );
}
