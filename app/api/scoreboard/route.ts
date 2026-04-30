import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/date";
import { getScoreboard } from "@/lib/scoreboard";
import { isCurrentUserAdmin } from "@/lib/auth/admin";

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdmin = user ? await isCurrentUserAdmin(supabase) : false;

  const data = await getScoreboard(supabase, {
    date: getToday(),
    includeRoster: !!user,
    includeNonResponders: isAdmin,
    userId: user?.id,
  });

  return NextResponse.json(data);
}
