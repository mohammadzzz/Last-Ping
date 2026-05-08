import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/guards/require-owner";
import { unwrapString } from "@/server/crypto/kek";
import { verifyTotp } from "@/server/auth/totp";
import { verifyCsrf } from "@/server/auth/csrf";
import { audit } from "@/server/audit";

const schema = z.object({ code: z.string().regex(/^\d{6}$/), csrf: z.string() });

export async function POST(req: NextRequest) {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!(await verifyCsrf(parsed.data.csrf))) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }

  const { owner } = ctx;
  const secret = unwrapString(Buffer.from(owner.totpSecretEnc), `owner:${owner.id}:totp`);
  if (!verifyTotp(secret, parsed.data.code)) {
    return NextResponse.json({ error: "invalid code" }, { status: 401 });
  }

  await prisma.owner.update({ where: { id: owner.id }, data: { totpEnrolled: true } });
  await audit("owner", "TOTP_ENROLLED", { targetType: "owner", targetId: owner.id });

  return NextResponse.json({ ok: true });
}
