import twilio from "twilio";
import { env } from "@/lib/env";

let client: ReturnType<typeof twilio> | null = null;

function get() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = env();
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  if (!client) client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return client;
}

export async function sendSms(
  to: string,
  body: string,
): Promise<{ id?: string; error?: string }> {
  const c = get();
  const from = env().TWILIO_FROM_SMS;
  if (!c || !from) return { error: "twilio SMS not configured" };
  try {
    const msg = await c.messages.create({ from, to, body });
    return { id: msg.sid };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function sendWhatsapp(
  to: string,
  body: string,
): Promise<{ id?: string; error?: string }> {
  const c = get();
  const from = env().TWILIO_FROM_WHATSAPP;
  if (!c || !from) return { error: "twilio WhatsApp not configured" };
  try {
    const waTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const msg = await c.messages.create({ from, to: waTo, body });
    return { id: msg.sid };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
