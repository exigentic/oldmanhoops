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
  const resend = getClient();
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
  });
  if (error) return { error: error.message };
  return { id: data?.id };
}

export async function notifyAdmin(subject: string, body: string): Promise<void> {
  try {
    const resend = getClient();
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: env.ADMIN_EMAIL,
      subject: `[OldManHoops admin] ${subject}`,
      text: body,
    });
  } catch (err) {
    console.error("notifyAdmin failed:", err);
  }
}
