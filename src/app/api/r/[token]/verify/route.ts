import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { lookupByToken } from "@/server/guards/require-recipient";
import { verifySecret } from "@/server/auth/password";
import { consumeRateLimit, policies } from "@/server/rate-limit";
import { getRecipientSession } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { getClock } from "@/lib/clock";
import { hashIp } from "@/server/crypto/tokens";
import { env } from "@/lib/env";

const schema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipH = hashIp(ip, env().IP_HASH_SALT);

  const rr = await lookupByToken(token);
  if (!rr) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (rr.status === "EXPIRED" || rr.status === "DELETED") {
    return NextResponse.json({ error: "gone" }, { status: 410 });
  }

  const rl = await consumeRateLimit(`otp_attempt:${rr.id}`, policies.otpAttempt);
  if (!rl.allowed) return NextResponse.json({ error: "locked out" }, { status: 429 });

  const now = getClock().now();
  const code = await prisma.verificationCode.findFirst({
    where: {
      releaseRecipientId: rr.id,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!code) return NextResponse.json({ error: "no active code" }, { status: 401 });

  const ok = await verifySecret(code.codeHash, parsed.data.code);
  await prisma.verificationCode.update({
    where: { id: code.id },
    data: {
      attempts: { increment: 1 },
      consumedAt: ok ? now : code.consumedAt,
    },
  });
  if (!ok) {
    await audit(`recipient:${rr.recipientId}`, "OTP_FAIL", {
      targetType: "releaseRecipient",
      targetId: rr.id,
      metadata: { ipH },
    });
    return NextResponse.json({ error: "invalid code" }, { status: 401 });
  }

  // Promote status to VERIFIED (idempotent; don't regress from DOWNLOADED).
  if (rr.status === "PENDING") {
    await prisma.releaseRecipient.update({
      where: { id: rr.id },
      data: { status: "VERIFIED" },
    });
  }

  const s = await getRecipientSession();
  s.releaseRecipientId = rr.id;
  s.recipientId = rr.recipientId;
  s.verifiedAt = Date.now();
  await s.save();

  await audit(`recipient:${rr.recipientId}`, "OTP_OK", {
    targetType: "releaseRecipient",
    targetId: rr.id,
    metadata: { ipH },
  });

  return NextResponse.json({ ok: true });
}
