import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/guards/require-owner";
import { verifyCsrf } from "@/server/auth/csrf";
import { verifyTotp } from "@/server/auth/totp";
import { unwrapString } from "@/server/crypto/kek";
import { audit } from "@/server/audit";

const schema = z.object({
  csrf: z.string(),
  totp: z.string().regex(/^\d{6}$/),
  enable: z.boolean(),
});

export async function POST(req: NextRequest) {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!(await verifyCsrf(parsed.data.csrf))) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }
  const secret = unwrapString(
    Buffer.from(ctx.owner.totpSecretEnc),
    `owner:${ctx.owner.id}:totp`,
  );
  if (!verifyTotp(secret, parsed.data.totp)) {
    return NextResponse.json({ error: "invalid totp" }, { status: 401 });
  }

  await prisma.appState.upsert({
    where: { id: 1 },
    update: { testMode: parsed.data.enable },
    create: { id: 1, mode: "ACTIVE", lastCheckinAt: new Date(), testMode: parsed.data.enable },
  });
  await audit("owner", "TEST_MODE_TOGGLE", {
    targetType: "owner",
    targetId: ctx.owner.id,
    metadata: { enabled: parsed.data.enable },
  });

  return NextResponse.json({ ok: true, testMode: parsed.data.enable });
}
