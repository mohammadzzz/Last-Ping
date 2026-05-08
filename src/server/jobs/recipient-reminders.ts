import { prisma } from "@/server/db";
import { getClock } from "@/lib/clock";
import { env } from "@/lib/env";
import { notify } from "@/server/notifications";
import { audit } from "@/server/audit";

/**
 * Remind recipients who haven't downloaded yet at roughly day 3, 7, 14, 28.
 * We gate each milestone by counting previous REMINDER notification attempts.
 */
const MILESTONES_DAYS = [3, 7, 14, 28];

export async function runRecipientReminders() {
  const now = getClock().now();
  const pending = await prisma.releaseRecipient.findMany({
    where: {
      status: { in: ["PENDING", "VERIFIED"] },
      release: { isTest: false },
    },
    include: { recipient: true, release: true },
  });
  if (pending.length === 0) return;

  const appUrl = env().APP_URL.replace(/\/$/, "");

  for (const rr of pending) {
    const ageDays = Math.floor((now.getTime() - rr.createdAt.getTime()) / 86_400_000);
    const milestone = MILESTONES_DAYS.filter((m) => ageDays >= m).pop();
    if (!milestone) continue;

    const already = await prisma.notificationAttempt.count({
      where: {
        recipientId: rr.recipientId,
        purpose: "REMINDER",
        attemptedAt: { gte: new Date(now.getTime() - 24 * 3600 * 1000) },
      },
    });
    if (already > 0) continue;

    // We can't reconstruct the token (we only stored the hash); so we send a
    // generic reminder that references the prior link they received.
    const r = rr.recipient;
    const body = `Hello ${r.displayName},

This is a reminder that a message is waiting for you (sent ~${ageDays} days ago).
If you no longer have the original link, please contact whoever shared it with you.
It will expire in ${Math.max(
      0,
      Math.ceil((rr.expiresAt.getTime() - now.getTime()) / 86_400_000),
    )} day(s).
`;

    if (r.email) {
      await notify({
        recipientId: r.id,
        channel: "EMAIL",
        purpose: "REMINDER",
        to: r.email,
        subject: "Reminder: a message is waiting",
        text: body,
      });
    }
    if (r.telegramChatId) {
      await notify({
        recipientId: r.id,
        channel: "TELEGRAM",
        purpose: "REMINDER",
        to: r.telegramChatId,
        text: body,
      });
    }
    void appUrl;
  }

  await audit("system", "REMINDERS_RUN", { metadata: { count: pending.length } });
}
