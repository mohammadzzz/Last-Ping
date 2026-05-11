import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { verifySecret } from "@/server/auth/password";
import { consumeRateLimit, policies } from "@/server/rate-limit";
import { hashIp } from "@/server/crypto/tokens";
import { audit } from "@/server/audit";
import { getStateView } from "@/server/state";
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

  // Status reads share the same brute-force surface as check-in (same secret),
  // so apply the same policy on a separate key namespace — widget polls don't
  // burn check-in budget, but PIN-guessing through this endpoint is still
  // bounded.
  const rlIpKey = `status_link_ip:${ipH}`;
  const rlTokenKey = `status_link_token:${parsed.data.token.slice(0, 12)}`;
  const [rlIp, rlToken] = await Promise.all([
    consumeRateLimit(rlIpKey, policies.checkinLinkRead),
    consumeRateLimit(rlTokenKey, policies.checkinLinkRead),
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
    : "$argon2id$v=19$m=65536,t=3,p=1$" +
      crypto.randomBytes(16).toString("base64") +
      "$" +
      crypto.randomBytes(32).toString("base64");
  const ok = await verifySecret(dummyHash, parsed.data.pin);

  if (!owner || !ok) {
    await audit("system", "STATUS_LINK_FAIL", {
      metadata: { reason: owner ? "bad_pin" : "bad_token", ipH },
    });
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const view = await getStateView();
  return NextResponse.json({
    mode: view.mode,
    testMode: view.testMode,
    lastCheckinAt: view.lastCheckinAt.toISOString(),
    warningStartedAt: view.warningStartedAt?.toISOString() ?? null,
    releasedAt: view.releasedAt?.toISOString() ?? null,
    ageSeconds: view.ageSeconds,
    secondsToWarning: view.secondsToWarning,
    secondsToRelease: view.secondsToRelease,
  });
}
