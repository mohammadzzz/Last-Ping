import { Resend } from "resend";
import { env } from "@/lib/env";

let client: Resend | null = null;

function get(): Resend | null {
  const { RESEND_API_KEY } = env();
  if (!RESEND_API_KEY) return null;
  if (!client) client = new Resend(RESEND_API_KEY);
  return client;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ id?: string; error?: string }> {
  const c = get();
  const from = env().RESEND_FROM_EMAIL;
  if (!c || !from) return { error: "resend not configured" };
  try {
    const res = await c.emails.send({ from, to, subject, html });
    if (res.error) return { error: res.error.message ?? String(res.error) };
    return { id: res.data?.id };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
