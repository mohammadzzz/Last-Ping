import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { verifySecret } from "@/server/auth/password";
import { verifyTotp } from "@/server/auth/totp";
import { unwrapString } from "@/server/crypto/kek";
import { getOwnerSession } from "@/server/auth/session";
import { ensureCsrfTokenInHandler } from "@/server/auth/csrf";
import { consumeRateLimit, policies, resetRateLimit } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { hashIp } from "@/server/crypto/tokens";
import { env } from "@/lib/env";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().regex(/^\d{6}$/).optional(),
});

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const ip = clientIp(req);
  const ipH = hashIp(ip, env().IP_HASH_SALT);
  const rlKey = `login:${ipH}`;
  const rl = await consumeRateLimit(rlKey, policies.login);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "too many attempts", lockedUntil: rl.lockedUntil },
      { status: 429 },
    );
  }

  const owner = await prisma.owner.findUnique({ where: { email: parsed.data.email } });
  if (!owner) {
    await audit("system", "LOGIN_FAIL", { metadata: { reason: "unknown_email", ipH } });
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  const pwOk = await verifySecret(owner.passwordHash, parsed.data.password);
  if (!pwOk) {
    await audit("system", "LOGIN_FAIL", {
      targetType: "owner",
      targetId: owner.id,
      metadata: { reason: "bad_password", ipH },
    });
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  // TOTP required unless the owner hasn't enrolled yet.
  if (owner.totpEnrolled) {
    if (!parsed.data.totp) {
      return NextResponse.json({ error: "totp required" }, { status: 401 });
    }
    const secret = unwrapString(Buffer.from(owner.totpSecretEnc), `owner:${owner.id}:totp`);
    if (!verifyTotp(secret, parsed.data.totp)) {
      await audit("system", "LOGIN_FAIL", {
        targetType: "owner",
        targetId: owner.id,
        metadata: { reason: "bad_totp", ipH },
      });
      return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
    }
  }

  const s = await getOwnerSession();
  s.ownerId = owner.id;
  s.loggedInAt = Date.now();
  await s.save();
  await ensureCsrfTokenInHandler(s);
  await resetRateLimit(rlKey);
  await audit("owner", "LOGIN_OK", { targetType: "owner", targetId: owner.id, metadata: { ipH } });

  return NextResponse.json({
    ok: true,
    needsTotpSetup: !owner.totpEnrolled,
  });
}
