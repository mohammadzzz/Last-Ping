import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/guards/require-owner";
import { verifyCsrf } from "@/server/auth/csrf";
import { audit } from "@/server/audit";

const patchSchema = z.object({
  csrf: z.string(),
  displayName: z.string().min(1).max(100).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
  telegramChatId: z.string().max(64).nullable().optional(),
  whatsappNumber: z.string().max(32).nullable().optional(),
  preferredOtpChannel: z.enum(["EMAIL", "SMS"]).optional(),
  personalMessage: z.string().max(20_000).optional(),
});

export async function PATCH(
  req: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctxParams.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!(await verifyCsrf(parsed.data.csrf))) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }
  const { csrf: _csrf, ...data } = parsed.data;

  const updated = await prisma.recipient.update({ where: { id }, data });
  await audit("owner", "RECIPIENT_UPDATE", {
    targetType: "recipient",
    targetId: id,
    metadata: { fields: Object.keys(data) },
  });
  return NextResponse.json({ recipient: updated });
}

export async function DELETE(
  req: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }
  const { id } = await ctxParams.params;

  const active = await prisma.releaseRecipient.count({
    where: { recipientId: id, status: { in: ["PENDING", "VERIFIED", "DOWNLOADING"] } },
  });
  if (active > 0) {
    return NextResponse.json(
      { error: "recipient has an active release" },
      { status: 409 },
    );
  }

  await prisma.recipient.delete({ where: { id } });
  await audit("owner", "RECIPIENT_DELETE", { targetType: "recipient", targetId: id });
  return NextResponse.json({ ok: true });
}
