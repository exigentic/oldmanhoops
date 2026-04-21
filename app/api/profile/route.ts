import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone, InvalidPhoneError } from "@/lib/phone";

interface ProfileBody {
  name?: string;
  reminder_email?: boolean;
  active?: boolean;
  phone?: string | null;
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }
  const body = raw as ProfileBody;

  const update: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "name must be a string" }, { status: 400 });
    }
    const trimmed = body.name.trim();
    if (trimmed.length === 0 || trimmed.length > 50) {
      return NextResponse.json(
        { error: "name must be 1-50 characters" },
        { status: 400 }
      );
    }
    update.name = trimmed;
  }

  if (body.reminder_email !== undefined) {
    if (typeof body.reminder_email !== "boolean") {
      return NextResponse.json(
        { error: "reminder_email must be boolean" },
        { status: 400 }
      );
    }
    update.reminder_email = body.reminder_email;
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "active must be boolean" }, { status: 400 });
    }
    update.active = body.active;
  }

  if (body.phone !== undefined) {
    if (body.phone !== null && typeof body.phone !== "string") {
      return NextResponse.json(
        { error: "phone must be a string or null" },
        { status: 400 }
      );
    }
    try {
      update.phone = normalizePhone(body.phone);
    } catch (err) {
      if (err instanceof InvalidPhoneError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from("players")
    .update(update)
    .eq("id", user.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
