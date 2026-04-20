import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getToday } from "@/lib/date";
import { getTodayScoreboard } from "@/lib/scoreboard";

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const data = await getTodayScoreboard(supabase, {
    today: getToday(),
    includeRoster: !!user,
  });

  return NextResponse.json(data);
}
