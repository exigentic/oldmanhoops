import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { validateSignupCode } from "@/lib/signup-code";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone, InvalidPhoneError } from "@/lib/phone";

interface SignupBody {
  email?: string;
  name?: string;
  code?: string;
  phone?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: SignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, name, code, phone } = body;
  if (!email || !name || !code) {
    return NextResponse.json(
      { error: "email, name, and code are required" },
      { status: 400 }
    );
  }

  if (!validateSignupCode(env.SIGNUP_CODE, code)) {
    return NextResponse.json({ error: "Invalid signup code" }, { status: 401 });
  }

  // Phone is optional; treat empty/whitespace-only as absent.
  let normalizedPhone: string | null = null;
  if (typeof phone === "string" && phone.trim().length > 0) {
    try {
      normalizedPhone = normalizePhone(phone);
    } catch (err) {
      if (err instanceof InvalidPhoneError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  const metadata: Record<string, string> = { name };
  if (normalizedPhone !== null) {
    metadata.phone = normalizedPhone;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: metadata,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
