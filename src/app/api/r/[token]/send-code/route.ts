import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { lookupByToken } from "@/server/guards/require-recipient";
import { generateOtp, hashIp } from "@/server/crypto/tokens";
import { hashSecret } from "@/server/auth/password";
import { consumeRateLimit, policies } from "@/server/rate-limit";
import { notify } from "@/server/notifications";
import { audit } from "@/server/audit";
import { getClock } from "@/lib/clock";
import { env } from "@/lib/env";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipH = hashIp(ip, env().IP_HASH_SALT);

  // Rate-limit OTP sends per token prefix (prevents burning OTP credits).
  const rl = await consumeRateLimit(`otp_send:${token.slice(0, 12)}`, policies.otpSend);
  if (!rl.allowed) return NextResponse.json({ error: "too many requests" }, { status: 429 });

  const rr = await lookupByToken(token);
  if (!rr) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (rr.status === "EXPIRED" || rr.status === "DELETED") {
    return NextResponse.json({ error: "gone" }, { status: 410 });
  }

  const body = await req.json().catch(() => ({}));
  const channel: "EMAIL" | "SMS" =
    body?.channel === "SMS" || body?.channel === "EMAIL"
      ? body.channel
      : rr.recipient.preferredOtpChannel;
  const dest =
    channel === "EMAIL" ? rr.recipient.email ?? null : rr.recipient.phone ?? null;
  if (!dest) return NextResponse.json({ error: "channel not available" }, { status: 400 });

  const code = generateOtp(6);
  const codeHash = await hashSecret(code);
  const now = getClock().now();

  // Invalidate any prior codes for this recipient — only the newest is valid.
  await prisma.verificationCode.updateMany({
    where: { releaseRecipientId: rr.id, consumedAt: null },
    data: { consumedAt: now },
  });
  await prisma.verificationCode.create({
    data: {
      releaseRecipientId: rr.id,
      codeHash,
      channel,
      sentTo: dest,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    },
  });

  const text = `Your Last Ping verification code is: ${code}\n\nIt expires in 10 minutes.`;
  if (channel === "EMAIL") {
    await notify({
      recipientId: rr.recipientId,
      channel: "EMAIL",
      purpose: "OTP",
      to: dest,
      subject: "Your verification code",
      text,
    });
  } else {
    await notify({
      recipientId: rr.recipientId,
      channel: "SMS",
      purpose: "OTP",
      to: dest,
      text,
    });
  }

  await audit(`recipient:${rr.recipientId}`, "OTP_SENT", {
    targetType: "releaseRecipient",
    targetId: rr.id,
    metadata: { channel, ipH },
  });

  return NextResponse.json({ ok: true, channel });
}
