import { prisma } from "@/server/db";
import { getClock } from "@/lib/clock";
import { env } from "@/lib/env";
import { randomToken, hashToken } from "@/server/crypto/tokens";
import { notify } from "@/server/notifications";
import { audit } from "@/server/audit";
import { createLogger } from "@/lib/logger";

const log = createLogger("release");

/**
 * Trigger a release. Creates a Release row and one ReleaseRecipient per
 * recipient that actually has any files assigned (no point notifying someone
 * who gets nothing). In test releases, only recipients whose sample files
 * exist get included.
 *
 * Idempotent guard: if the app state already says RELEASED, refuses unless
 * opts.allowReRelease is set (manual re-trigger).
 */
export async function triggerRelease(opts: {
  trigger: "INACTIVITY" | "MANUAL" | "TEST";
  isTest?: boolean;
  allowReRelease?: boolean;
}) {
  const now = getClock().now();
  const state = await prisma.appState.findUnique({ where: { id: 1 } });
  if (!state) throw new Error("app state missing");
  if (!opts.allowReRelease && state.mode === "RELEASED") {
    return { skipped: true, reason: "already-released" };
  }

  const recipients = await prisma.recipient.findMany({
    where: opts.isTest
      ? { assignments: { some: { file: { isSample: true } } } }
      : { assignments: { some: {} } },
  });

  if (recipients.length === 0) {
    log.warn({ trigger: opts.trigger, isTest: !!opts.isTest }, "release empty: no recipients");
    await audit("system", "RELEASE_EMPTY", { metadata: { trigger: opts.trigger } });
    return { skipped: true, reason: "no-recipients" };
  }

  log.warn(
    {
      trigger: opts.trigger,
      isTest: !!opts.isTest,
      recipientCount: recipients.length,
      from: state.mode,
      to: opts.isTest ? state.mode : "RELEASED",
    },
    "release triggered",
  );

  const release = await prisma.release.create({
    data: { trigger: opts.trigger, isTest: !!opts.isTest },
  });

  const tokens: { recipientId: string; token: string }[] = [];
  const expiresAt = new Date(now.getTime() + env().RECIPIENT_EXPIRY_SECONDS * 1000);

  for (const r of recipients) {
    const token = randomToken(32);
    tokens.push({ recipientId: r.id, token });
    await prisma.releaseRecipient.create({
      data: {
        releaseId: release.id,
        recipientId: r.id,
        downloadTokenHash: hashToken(token),
        status: "PENDING",
        expiresAt,
      },
    });
  }

  await prisma.appState.update({
    where: { id: 1 },
    data: {
      mode: opts.isTest ? state.mode : "RELEASED",
      releasedAt: opts.isTest ? state.releasedAt : now,
    },
  });

  await audit("system", "RELEASE_TRIGGERED", {
    targetType: "release",
    targetId: release.id,
    metadata: { trigger: opts.trigger, isTest: !!opts.isTest, recipientCount: recipients.length },
  });

  const appUrl = env().APP_URL.replace(/\/$/, "");
  for (const { recipientId, token } of tokens) {
    const recipient = recipients.find((x) => x.id === recipientId)!;
    const link = `${appUrl}/r/${token}`;
    const subject = opts.isTest ? "[TEST] You have a message" : "You have a message";
    const body = `Hello ${recipient.displayName},

Someone has left you a message.

Open this link to receive it:
${link}

You will be asked to verify with a one-time code.
This link expires on ${expiresAt.toUTCString()}.
`;

    // For test releases, only notify the owner's own contact methods, not the
    // recipient — prevents surprise messages during rehearsal.
    if (opts.isTest) {
      const channels = env().OWNER_WARNING_CHANNELS;
      const testSubject = `[TEST] Would-send to ${recipient.displayName}`;
      const testShort = `[TEST] Would-send to ${recipient.displayName}. Open: ${link}`;
      if (channels.includes("EMAIL") && env().OWNER_CONTACT_EMAIL) {
        await notify({
          recipientId,
          channel: "EMAIL",
          purpose: "TEST",
          to: env().OWNER_CONTACT_EMAIL!,
          subject: testSubject,
          text: body,
        });
      }
      if (channels.includes("TELEGRAM") && env().TELEGRAM_OWNER_CHAT_ID) {
        await notify({
          recipientId,
          channel: "TELEGRAM",
          purpose: "TEST",
          to: env().TELEGRAM_OWNER_CHAT_ID!,
          text: testShort,
        });
      }
      if (channels.includes("SMS") && env().OWNER_CONTACT_PHONE) {
        await notify({
          recipientId,
          channel: "SMS",
          purpose: "TEST",
          to: env().OWNER_CONTACT_PHONE!,
          text: testShort,
        });
      }
      if (channels.includes("WHATSAPP") && env().OWNER_CONTACT_WHATSAPP) {
        const waSid = env().TWILIO_WA_TEMPLATE_TEST_RELEASE;
        await notify({
          recipientId,
          channel: "WHATSAPP",
          purpose: "TEST",
          to: env().OWNER_CONTACT_WHATSAPP!,
          text: testShort,
          ...(waSid && {
            waContentSid: waSid,
            waContentVariables: { "1": env().OWNER_DISPLAY_NAME, "2": env().OWNER_CONTACT_EMAIL ?? "" },
          }),
        });
      }
      continue;
    }

    if (recipient.email) {
      await notify({
        recipientId,
        channel: "EMAIL",
        purpose: "RELEASE",
        to: recipient.email,
        subject,
        text: body,
      });
    }
    if (recipient.telegramChatId) {
      await notify({
        recipientId,
        channel: "TELEGRAM",
        purpose: "RELEASE",
        to: recipient.telegramChatId,
        text: body,
      });
    }
    if (recipient.phone) {
      await notify({
        recipientId,
        channel: "SMS",
        purpose: "RELEASE",
        to: recipient.phone,
        text: `You have a message. Open: ${link}`,
      });
    }
    if (recipient.whatsappNumber) {
      const waSid = env().TWILIO_WA_TEMPLATE_RELEASE;
      await notify({
        recipientId,
        channel: "WHATSAPP",
        purpose: "RELEASE",
        to: recipient.whatsappNumber,
        text: `You have a message from ${env().OWNER_DISPLAY_NAME}. Check ${recipient.email ?? "your email"} for the download link.`,
        ...(waSid && {
          waContentSid: waSid,
          waContentVariables: { "1": env().OWNER_DISPLAY_NAME, "2": recipient.email ?? "" },
        }),
      });
    }
  }

  return { skipped: false, releaseId: release.id, recipientCount: recipients.length };
}
