import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type VerifyType = "email" | "invite" | "recovery" | "email_change";

interface VerifyBody {
  email?: string;
  token?: string;
  type?: VerifyType;
}

export async function POST(request: Request): Promise<Response> {
  let body: VerifyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, token, type } = body;
  if (!email || !token || !type) {
    return NextResponse.json(
      { error: "email, token, and type are required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
