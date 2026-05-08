import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/guards/require-owner";
import { verifyCsrf } from "@/server/auth/csrf";
import { audit } from "@/server/audit";

const schema = z.object({
  csrf: z.string(),
  recipientId: z.string().uuid(),
  fileId: z.string().uuid(),
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
  const { recipientId, fileId } = parsed.data;

  await prisma.recipientFileAssignment.upsert({
    where: { recipientId_fileId: { recipientId, fileId } },
    update: {},
    create: { recipientId, fileId },
  });
  await audit("owner", "ASSIGNMENT_CREATE", {
    targetType: "assignment",
    targetId: `${recipientId}:${fileId}`,
  });
  return NextResponse.json({ ok: true });
}
