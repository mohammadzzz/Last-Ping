import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/guards/require-owner";
import { verifyCsrf } from "@/server/auth/csrf";
import { audit } from "@/server/audit";

export async function DELETE(
  req: NextRequest,
  ctxParams: { params: Promise<{ recipientId: string; fileId: string }> },
) {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }
  const { recipientId, fileId } = await ctxParams.params;

  await prisma.recipientFileAssignment
    .delete({ where: { recipientId_fileId: { recipientId, fileId } } })
    .catch(() => {});
  await audit("owner", "ASSIGNMENT_DELETE", {
    targetType: "assignment",
    targetId: `${recipientId}:${fileId}`,
  });
  return NextResponse.json({ ok: true });
}
