import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getToday, isValidGameDate } from "@/lib/date";
import { getScoreboard } from "@/lib/scoreboard";
import { isCurrentUserAdmin } from "@/lib/auth/admin";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const date = dateParam ?? getToday();
  if (dateParam !== null && !isValidGameDate(dateParam)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdmin = user ? await isCurrentUserAdmin(supabase) : false;

  const data = await getScoreboard(supabase, {
    date,
    includeRoster: !!user,
    includeNonResponders: isAdmin,
    userId: user?.id,
  });

  return NextResponse.json(data);
}
