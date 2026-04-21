import { createClient } from "@/lib/supabase/server";

export async function POST(): Promise<Response> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return new Response(null, { status: 303, headers: { Location: "/" } });
}
