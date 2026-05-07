import type { SupabaseClient } from "@supabase/supabase-js";

// `auth.getUser()` is a network round-trip every call; pass an already-fetched
// user to skip it.
export async function isCurrentUserAdmin(
  supabase: SupabaseClient,
  user?: { id: string } | null,
): Promise<boolean> {
  let userId: string | null;
  if (user !== undefined) {
    userId = user?.id ?? null;
  } else {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  }
  if (!userId) return false;
  const { data, error } = await supabase
    .from("players")
    .select("is_admin")
    .eq("id", userId)
    .single();
  if (error || !data) return false;
  return data.is_admin === true;
}
