import { notFound } from "next/navigation";
import { lookupByToken } from "@/server/guards/require-recipient";
import { VerifyForm } from "./form";

export const dynamic = "force-dynamic";

export default async function RecipientLanding({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const rr = await lookupByToken(token);

  if (!rr) return notFound();
  if (rr.status === "EXPIRED" || rr.status === "DELETED") {
    return (
      <main className="mx-auto max-w-sm p-8">
        <h1 className="mb-3 text-xl font-semibold">This link has expired</h1>
        <p className="text-sm text-neutral-400">
          The files and message are no longer available.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-2 text-2xl font-semibold">A message is waiting for you</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Hello {rr.recipient.displayName}. To continue, we&apos;ll send you a one-time code to
        verify it&apos;s you.
      </p>
      <VerifyForm
        token={token}
        defaultChannel={rr.recipient.preferredOtpChannel}
        hasEmail={!!rr.recipient.email}
        hasSms={!!rr.recipient.phone}
      />
    </main>
  );
}
