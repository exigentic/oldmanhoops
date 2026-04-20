import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { formatGameDate, getToday } from "@/lib/date";
import { getTodayScoreboard } from "@/lib/scoreboard";
import { Scoreboard } from "@/app/_components/Scoreboard";

export const dynamic = "force-dynamic";

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
  const initial = await getTodayScoreboard(supabase, {
    today,
    includeRoster: !!user,
    userId: user?.id,
  });

  return (
    <main className="min-h-screen flex flex-col items-center bg-neutral-50 text-neutral-900 p-6 pt-8 gap-6">
      <header className="flex items-center gap-4">
        <Image src="/omh.svg" alt="Old Man Hoops" width={56} height={56} />
        <div className="flex flex-col leading-tight">
          <h1 className="text-2xl font-bold text-amber-600">Old Man Hoops</h1>
          <p className="text-sm text-neutral-600">One Athletics at Noon</p>
          <p className="text-sm text-neutral-500 mt-0.5">{formatGameDate(today)}</p>
        </div>
      </header>

      <div className="w-full max-w-5xl flex flex-col items-center gap-6">
        <Scoreboard
          initial={initial}
          urlStatus={urlStatus ?? null}
          focusNoteOnMount={!!urlStatus}
        />

        {!user && (
          <Link
            href="/join"
            className="rounded-md bg-amber-500 text-white px-4 py-2 font-semibold hover:bg-amber-600"
          >
            Sign Up to Play
          </Link>
        )}

        {user && (
          <Link
            href="/settings"
            className="text-sm text-neutral-500 hover:underline"
          >
            Manage Settings
          </Link>
        )}
      </div>
    </main>
  );
}
