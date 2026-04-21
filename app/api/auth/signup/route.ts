import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { validateSignupCode } from "@/lib/signup-code";
import { createAdminClient } from "@/lib/supabase/admin";

interface SignupBody {
  email?: string;
  name?: string;
  code?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: SignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, name, code } = body;
  if (!email || !name || !code) {
    return NextResponse.json(
      { error: "email, name, and code are required" },
      { status: 400 }
    );
  }

  if (!validateSignupCode(env.SIGNUP_CODE, code)) {
    return NextResponse.json({ error: "Invalid signup code" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { name },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
