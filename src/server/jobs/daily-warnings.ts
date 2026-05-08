import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import { getClock } from "@/lib/clock";
import { notify } from "@/server/notifications";
import { audit } from "@/server/audit";
import { effectiveAgeSeconds } from "@/server/state";

/**
 * When in WARNING state, send a warning notification to the owner on each
 * enabled channel. Gated so we only do it once per effective day.
 */
export async function runDailyWarnings() {
  const state = await prisma.appState.findUnique({ where: { id: 1 } });
  if (!state || state.mode !== "WARNING") return;

  const now = getClock().now();
  const dayKey = `warning:${Math.floor(now.getTime() / 86_400_000)}:${state.testMode ? "test" : "live"}`;
  const existing = await prisma.notificationAttempt.count({
    where: {
      purpose: "WARNING",
      attemptedAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) }, // 1h floor
    },
  });
  if (existing > 0) return;
  void dayKey;

  const age = await effectiveAgeSeconds();
  const days = Math.floor(age / 86400);
  const text = `⚠ Last Ping — you have not checked in for ~${days} day(s). If you do not check in by ${new Date(
    now.getTime() + Math.max(0, env().RELEASE_AFTER_SECONDS - age) * 1000,
  ).toUTCString()}, messages will be released to your recipients.`;

  const channels = env().OWNER_WARNING_CHANNELS;
  const sends: Promise<unknown>[] = [];

  if (channels.includes("EMAIL") && env().OWNER_CONTACT_EMAIL) {
    sends.push(
      notify({
        channel: "EMAIL",
        purpose: "WARNING",
        to: env().OWNER_CONTACT_EMAIL!,
        subject: "Last Ping — check in now",
        text,
      }),
    );
  }
  if (channels.includes("TELEGRAM") && env().TELEGRAM_OWNER_CHAT_ID) {
    sends.push(
      notify({
        channel: "TELEGRAM",
        purpose: "WARNING",
        to: env().TELEGRAM_OWNER_CHAT_ID!,
        text,
      }),
    );
  }
  if (channels.includes("SMS") && env().OWNER_CONTACT_PHONE) {
    sends.push(
      notify({
        channel: "SMS",
        purpose: "WARNING",
        to: env().OWNER_CONTACT_PHONE!,
        text,
      }),
    );
  }
  if (channels.includes("WHATSAPP") && env().OWNER_CONTACT_WHATSAPP) {
    sends.push(
      notify({
        channel: "WHATSAPP",
        purpose: "WARNING",
        to: env().OWNER_CONTACT_WHATSAPP!,
        text,
      }),
    );
  }

  await Promise.all(sends);
  await audit("system", "WARNING_SENT", { metadata: { ageSeconds: age, channels } });
}
