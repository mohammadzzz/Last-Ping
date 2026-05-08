import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOwner } from "@/server/guards/require-owner";
import { prisma } from "@/server/db";
import { getCsrfToken } from "@/server/auth/csrf";
import { FilesClient } from "./client";

export default async function FilesPage() {
  const ctx = await requireOwner();
  if (!ctx) redirect("/login");
  if (!ctx.owner.totpEnrolled) redirect("/totp-setup");

  const files = await prisma.mediaFile.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { assignments: true } } },
  });
  const csrf = await getCsrfToken();
  if (!csrf) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Files</h1>
        <Link href="/dashboard" className="text-sm text-neutral-400">
          &larr; Dashboard
        </Link>
      </header>
      <FilesClient
        csrf={csrf}
        initialFiles={files.map((f) => ({
          id: f.id,
          originalName: f.originalName,
          mimeType: f.mimeType,
          sizeBytes: Number(f.sizeBytes),
          createdAt: f.createdAt.toISOString(),
          assignmentCount: f._count.assignments,
          isSample: f.isSample,
        }))}
      />
    </main>
  );
}
