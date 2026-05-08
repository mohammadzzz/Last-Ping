import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { CheckinLinkForm } from "./form";

export const dynamic = "force-dynamic";

export default async function CheckinLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // We deliberately do not reveal whether the token is valid or not before the
  // PIN submit — respond with the same UI either way. But to avoid cost of
  // argon2 on junk, we still check existence server-side in the POST handler.
  // Render the form regardless.
  void prisma; // suppress unused — the POST route is the real gate
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return notFound();
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-2xl font-semibold">Check in</h1>
      <p className="mb-4 text-sm text-neutral-400">
        Enter your PIN to confirm you&apos;re OK.
      </p>
      <CheckinLinkForm token={token} />
    </main>
  );
}
