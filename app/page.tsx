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
        <Image src="/omh.svg" alt="" width={56} height={56} />
        <div className="flex flex-col leading-tight">
          <h1 className="text-2xl font-bold text-indigo-700">Old Man Hoops</h1>
          <p className="text-sm text-neutral-600">M-F, Noon @ One Athletics</p>
          <p className="text-sm text-neutral-500 mt-0.5">{formatGameDate(today)}</p>
        </div>
      </header>

      <div className="w-full max-w-lg flex flex-col items-center gap-6">
        <Scoreboard
          initial={initial}
          urlStatus={urlStatus ?? null}
          focusNoteOnMount={!!urlStatus}
        />

        {!user && (
          <div className="flex flex-col items-center gap-2">
            <Link
              href="/join"
              className="rounded-md bg-indigo-600 text-white px-4 py-2 font-semibold hover:bg-indigo-700"
            >
              Sign Up to Play
            </Link>
            <Link href="/login" className="text-sm text-neutral-500 hover:underline">
              Already a member? Log in
            </Link>
          </div>
        )}

        {user && (
          <div className="flex items-center gap-4 text-sm text-neutral-500">
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
