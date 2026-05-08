import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/guards/require-owner";
import { prisma } from "@/server/db";
import { getCsrfToken } from "@/server/auth/csrf";
import { RecipientsClient } from "./client";

export default async function RecipientsPage() {
  const ctx = await requireOwner();
  if (!ctx) redirect("/login");
  if (!ctx.owner.totpEnrolled) redirect("/totp-setup");

  const recipients = await prisma.recipient.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { assignments: true } } },
  });
  const csrf = await getCsrfToken();
  if (!csrf) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Recipients</h1>
        <Link href="/dashboard" className="text-sm text-neutral-400">
          &larr; Dashboard
        </Link>
      </header>
      <RecipientsClient
        csrf={csrf}
        initial={recipients.map((r) => ({
          id: r.id,
          displayName: r.displayName,
          email: r.email,
          phone: r.phone,
          telegramChatId: r.telegramChatId,
          whatsappNumber: r.whatsappNumber,
          preferredOtpChannel: r.preferredOtpChannel,
          assignmentCount: r._count.assignments,
        }))}
      />
    </main>
  );
}
