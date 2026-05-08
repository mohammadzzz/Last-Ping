import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { verifySecret } from "@/server/auth/password";
import { consumeRateLimit, policies, resetRateLimit } from "@/server/rate-limit";
import { hashIp } from "@/server/crypto/tokens";
import { audit } from "@/server/audit";
import { getClock } from "@/lib/clock";
import { env } from "@/lib/env";

const schema = z.object({
  token: z.string().min(20).max(64),
  pin: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipH = hashIp(ip, env().IP_HASH_SALT);

  // Rate-limit by IP AND by token prefix (so a leaked token can't be hammered
  // from many IPs cheaply).
  const rlIpKey = `checkin_link_ip:${ipH}`;
  const rlTokenKey = `checkin_link_token:${parsed.data.token.slice(0, 12)}`;
  const [rlIp, rlToken] = await Promise.all([
    consumeRateLimit(rlIpKey, policies.checkinLink),
    consumeRateLimit(rlTokenKey, policies.checkinLink),
  ]);
  if (!rlIp.allowed || !rlToken.allowed) {
    return NextResponse.json({ error: "too many attempts" }, { status: 429 });
  }

  const owner = await prisma.owner.findUnique({
    where: { checkinLinkToken: parsed.data.token },
  });

  // Constant-ish-time: always perform an argon2 verify, even for unknown token.
  const dummyHash = owner
    ? owner.checkinPinHash
    : // A real-looking argon2id hash over random material so timing leaks nothing.
      "$argon2id$v=19$m=65536,t=3,p=1$" +
      crypto.randomBytes(16).toString("base64") +
      "$" +
      crypto.randomBytes(32).toString("base64");
  const ok = await verifySecret(dummyHash, parsed.data.pin);

  if (!owner || !ok) {
    await audit("system", "CHECKIN_LINK_FAIL", {
      metadata: { reason: owner ? "bad_pin" : "bad_token", ipH },
    });
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const now = getClock().now();
  await prisma.$transaction([
    prisma.appState.upsert({
      where: { id: 1 },
      update: { mode: "ACTIVE", lastCheckinAt: now, warningStartedAt: null },
      create: { id: 1, mode: "ACTIVE", lastCheckinAt: now },
    }),
    prisma.checkinRecord.create({
      data: { at: now, source: "LINK", ipHash: ipH },
    }),
  ]);
  await Promise.all([resetRateLimit(rlIpKey), resetRateLimit(rlTokenKey)]);
  await audit("owner", "CHECKIN", {
    targetType: "owner",
    targetId: owner.id,
    metadata: { source: "LINK" },
  });

  return NextResponse.json({
    ok: true,
    message: "You're checked in. Nothing will be sent.",
  });
}
