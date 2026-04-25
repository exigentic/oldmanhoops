import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/date";
import { getTodayScoreboard } from "@/lib/scoreboard";
import { isCurrentUserAdmin } from "@/lib/auth/admin";

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdmin = user ? await isCurrentUserAdmin(supabase) : false;

  const data = await getTodayScoreboard(supabase, {
    today: getToday(),
    includeRoster: !!user,
    includeNonResponders: isAdmin,
    userId: user?.id,
  });

  return NextResponse.json(data);
}
