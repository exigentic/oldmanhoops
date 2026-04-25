import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { formatGameDate, getToday } from "@/lib/date";
import { getTodayScoreboard } from "@/lib/scoreboard";
import { isCurrentUserAdmin } from "@/lib/auth/admin";
import { Scoreboard } from "@/app/_components/Scoreboard";
import { getSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const today = getToday();
  const origin = getSiteOrigin();

  const base: Metadata = {
    title: "Old Man Hoops",
    description: "Daily pickup basketball RSVP",
  };

  if (!origin) return base;

  const ogUrl = `${origin}/og/${today}`;
  return {
    ...base,
    openGraph: {
      title: "Old Man Hoops",
      description: "Daily pickup basketball RSVP",
      images: [{ url: ogUrl, width: 1200, height: 630, alt: "Old Man Hoops — today's RSVP counts" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Old Man Hoops",
      description: "Daily pickup basketball RSVP",
      images: [ogUrl],
    },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: urlStatus } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = getToday();
  const isAdmin = user ? await isCurrentUserAdmin(supabase) : false;
  const initial = await getTodayScoreboard(supabase, {
    today,
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
          <p className="text-sm text-neutral-600 mt-0.5">{formatGameDate(today)}</p>
        </div>
      </header>

      <div className="w-full max-w-lg flex flex-col items-center gap-6">
        <Scoreboard
          initial={initial}
          urlStatus={urlStatus ?? null}
          focusNoteOnMount={!!urlStatus}
          isAdmin={isAdmin}
          currentUserId={user?.id ?? null}
        />

        {!user && (
          <div className="flex items-center gap-3">
            <Link
              href="/join"
              className="rounded-md bg-indigo-600 text-white px-4 py-2 font-semibold hover:bg-indigo-700"
            >
              Sign Up to Play
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-indigo-600 bg-white text-indigo-700 px-4 py-2 font-semibold hover:bg-indigo-50"
            >
              Log in
            </Link>
          </div>
        )}

        {user && (
          <div className="flex items-center gap-4 text-sm text-neutral-600">
            <Link href="/settings" className="hover:underline">
              Manage Settings
            </Link>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="hover:underline">
                Log out
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
