import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/guards/require-owner";
import { verifyCsrf } from "@/server/auth/csrf";
import { audit } from "@/server/audit";
import { removeIfExists, storagePathForId } from "@/server/storage/files";

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
  const file = await prisma.mediaFile.findUnique({
    where: { id },
    include: {
      _count: { select: { assignments: true } },
      assignments: {
        include: {
          recipient: {
            include: {
              releaseRecipients: {
                where: { status: { in: ["PENDING", "VERIFIED", "DOWNLOADING"] } },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });

  const activeRelease = file.assignments.some((a) => a.recipient.releaseRecipients.length > 0);
  if (activeRelease) {
    return NextResponse.json(
      { error: "file is referenced by an active release" },
      { status: 409 },
    );
  }

  // Remove encrypted blob, then DB row (assignments cascade).
  const p = storagePathForId(file.id);
  await prisma.$transaction([
    prisma.recipientFileAssignment.deleteMany({ where: { fileId: file.id } }),
    prisma.mediaFile.delete({ where: { id: file.id } }),
  ]);
  await removeIfExists(p);

  await audit("owner", "FILE_DELETE", { targetType: "file", targetId: file.id });
  return NextResponse.json({ ok: true });
}
