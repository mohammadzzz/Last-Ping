import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { verifySecret } from "@/server/auth/password";
import { consumeRateLimit, policies } from "@/server/rate-limit";
import { hashIp } from "@/server/crypto/tokens";
import { audit } from "@/server/audit";
import { env } from "@/lib/env";

const schema = z.object({
  token: z.string().min(20).max(64),
  pin: z.string().min(1).max(128),
  limit: z.number().int().positive().max(50).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipH = hashIp(ip, env().IP_HASH_SALT);

  const rlIpKey = `history_link_ip:${ipH}`;
  const rlTokenKey = `history_link_token:${parsed.data.token.slice(0, 12)}`;
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

  const dummyHash = owner
    ? owner.checkinPinHash
    : "$argon2id$v=19$m=65536,t=3,p=1$" +
      crypto.randomBytes(16).toString("base64") +
      "$" +
      crypto.randomBytes(32).toString("base64");
  const ok = await verifySecret(dummyHash, parsed.data.pin);

  if (!owner || !ok) {
    await audit("system", "HISTORY_LINK_FAIL", {
      metadata: { reason: owner ? "bad_pin" : "bad_token", ipH },
    });
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const limit = parsed.data.limit ?? 20;
  const rows = await prisma.checkinRecord.findMany({
    orderBy: { at: "desc" },
    take: limit,
    select: { at: true, source: true },
  });

  return NextResponse.json({
    checkins: rows.map((r) => ({ at: r.at.toISOString(), source: r.source })),
  });
}
