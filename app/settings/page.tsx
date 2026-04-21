import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("name, phone, reminder_email, active")
    .eq("id", user.id)
    .single();
  if (playerErr) {
    console.error(`settings: player fetch failed for ${user.id}: ${playerErr.message}`);
  }

  const pendingEmail = user.new_email ?? null;

  return (
    <main className="min-h-screen flex flex-col items-center bg-stone-300 text-neutral-900 p-6 pt-8 gap-6">
      <header className="flex items-center gap-4">
        <Image src="/omh.svg" alt="" width={56} height={56} />
        <div className="flex flex-col leading-tight">
          <h1 className="text-2xl font-bold text-indigo-700">Settings</h1>
          <Link href="/" className="text-sm text-neutral-600 hover:underline">
            ← Back to scoreboard
          </Link>
        </div>
      </header>

      <SettingsForm
        initialName={player?.name ?? ""}
        initialEmail={user.email ?? ""}
        initialPhone={player?.phone ?? null}
        initialReminderEmail={player?.reminder_email ?? true}
        initialActive={player?.active ?? true}
        pendingEmail={pendingEmail}
      />
    </main>
  );
}
