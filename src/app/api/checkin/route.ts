import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/guards/require-owner";
import { verifyCsrf } from "@/server/auth/csrf";
import { audit } from "@/server/audit";
import { getClock } from "@/lib/clock";
import { hashIp } from "@/server/crypto/tokens";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }

  const now = getClock().now();
  const ipH = hashIp(
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    env().IP_HASH_SALT,
  );

  await prisma.$transaction([
    prisma.appState.upsert({
      where: { id: 1 },
      update: { mode: "ACTIVE", lastCheckinAt: now, warningStartedAt: null },
      create: { id: 1, mode: "ACTIVE", lastCheckinAt: now },
    }),
    prisma.checkinRecord.create({
      data: { at: now, source: "LOGIN", ipHash: ipH },
    }),
  ]);

  await audit("owner", "CHECKIN", {
    targetType: "owner",
    targetId: ctx.owner.id,
    metadata: { source: "LOGIN" },
  });

  return NextResponse.json({
    ok: true,
    message: "You're checked in. Nothing will be sent.",
  });
}
