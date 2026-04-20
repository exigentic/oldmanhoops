import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/date";
import { getTodayScoreboard } from "@/lib/scoreboard";
import { Scoreboard } from "@/app/_components/Scoreboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const initial = await getTodayScoreboard(supabase, {
    today: getToday(),
    includeRoster: !!user,
  });

  return (
    <main className="min-h-screen flex flex-col items-center bg-neutral-950 text-neutral-100 p-6 pt-12 gap-8">
      <header className="flex flex-col items-center gap-2">
        <Image src="/omh.svg" alt="OldManHoops" width={48} height={48} />
        <h1 className="text-2xl font-bold text-amber-400">OldManHoops</h1>
      </header>

      <Scoreboard initial={initial} />

      {!user && (
        <Link
          href="/join"
          className="rounded-md bg-amber-400 text-neutral-950 px-4 py-2 font-semibold"
        >
          Sign Up to Play
        </Link>
      )}
    </main>
  );
}
