import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOwner } from "@/server/guards/require-owner";
import { prisma } from "@/server/db";
import { getCsrfToken } from "@/server/auth/csrf";
import { RecipientDetailClient } from "./client";

export default async function RecipientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireOwner();
  if (!ctx) redirect("/login");
  if (!ctx.owner.totpEnrolled) redirect("/totp-setup");

  const { id } = await params;
  const [recipient, files, csrf] = await Promise.all([
    prisma.recipient.findUnique({
      where: { id },
      include: { assignments: { include: { file: true } } },
    }),
    prisma.mediaFile.findMany({ orderBy: { createdAt: "desc" } }),
    getCsrfToken(),
  ]);
  if (!csrf) redirect("/login");
  if (!recipient) return notFound();

  const assignedIds = new Set(recipient.assignments.map((a) => a.fileId));

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">{recipient.displayName}</h1>
        <Link href="/recipients" className="text-sm text-neutral-400">
          &larr; Recipients
        </Link>
      </header>

      <RecipientDetailClient
        csrf={csrf}
        recipient={{
          id: recipient.id,
          displayName: recipient.displayName,
          email: recipient.email,
          phone: recipient.phone,
          telegramChatId: recipient.telegramChatId,
          whatsappNumber: recipient.whatsappNumber,
          preferredOtpChannel: recipient.preferredOtpChannel,
          personalMessage: recipient.personalMessage,
        }}
        files={files.map((f) => ({
          id: f.id,
          originalName: f.originalName,
          sizeBytes: Number(f.sizeBytes),
          assigned: assignedIds.has(f.id),
        }))}
      />
    </main>
  );
}
