import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

interface LoginBody {
  email?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: body.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteOrigin(request)}/auth/callback`,
    },
  });

  if (error) {
    // Don't leak whether the email exists — log internally but respond 200.
    console.error("Login OTP error:", error.message);
  }

  return NextResponse.json({ ok: true });
}
