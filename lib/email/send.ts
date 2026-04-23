import { Resend } from "resend";
import { env } from "@/lib/env";

let client: Resend | null = null;

function getClient(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ id?: string; error?: string }> {
  try {
    const resend = getClient();
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    if (error) return { error: error.message };
    return { id: data?.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendEmailBatch(
  emails: Array<{ to: string; subject: string; html: string }>
): Promise<{ count?: number; error?: string }> {
  if (emails.length === 0) return { count: 0 };
  try {
    const resend = getClient();
    const payload = emails.map((e) => ({ from: env.EMAIL_FROM, ...e }));
    const { error } = await resend.batch.send(payload);
    if (error) return { error: error.message };
    return { count: emails.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function notifyAdmin(subject: string, body: string): Promise<void> {
  try {
    const resend = getClient();
    const { error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: env.ADMIN_EMAIL,
      subject: `[OldManHoops admin] ${subject}`,
      text: body,
    });
    if (error) console.error("notifyAdmin failed:", error.message);
  } catch (err) {
    console.error("notifyAdmin failed:", err);
  }
}
