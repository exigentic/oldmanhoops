import type { SupabaseClient } from "@supabase/supabase-js";

export async function isCurrentUserAdmin(
  supabase: SupabaseClient,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("players")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (error || !data) return false;
  return data.is_admin === true;
}
