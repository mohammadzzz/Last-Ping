import { prisma } from "@/server/db";
import type { Channel, NotifPurpose } from "@prisma/client";
import { sendEmail } from "./email-resend";
import { sendTelegram } from "./telegram";
import { sendSms, sendWhatsapp } from "./twilio";

export interface NotifyRequest {
  recipientId?: string | null;
  channel: Channel;
  purpose: NotifPurpose;
  to: string; // email / phone / telegram chat id
  subject?: string;
  text: string;
  html?: string;
}

export async function notify(r: NotifyRequest): Promise<{ ok: boolean; error?: string; id?: string }> {
  const attempt = await prisma.notificationAttempt.create({
    data: {
      recipientId: r.recipientId ?? null,
      channel: r.channel,
      purpose: r.purpose,
      status: "QUEUED",
    },
  });

  let result: { id?: string; error?: string };
  switch (r.channel) {
    case "EMAIL":
      result = await sendEmail(
        r.to,
        r.subject ?? "Last Ping",
        r.html ?? `<pre style="font-family:system-ui">${escapeHtml(r.text)}</pre>`,
      );
      break;
    case "TELEGRAM":
      result = await sendTelegram(r.to, r.text);
      break;
    case "SMS":
      result = await sendSms(r.to, r.text);
      break;
    case "WHATSAPP":
      result = await sendWhatsapp(r.to, r.text);
      break;
  }

  await prisma.notificationAttempt.update({
    where: { id: attempt.id },
    data: {
      status: result.error ? "FAILED" : "SENT",
      providerMessageId: result.id,
      error: result.error ?? null,
    },
  });

  return { ok: !result.error, error: result.error, id: result.id };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
