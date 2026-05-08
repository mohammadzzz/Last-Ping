import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/guards/require-owner";
import { prisma } from "@/server/db";
import { getCsrfToken } from "@/server/auth/csrf";
import { TestModeClient } from "./client";

export default async function TestModePage() {
  const ctx = await requireOwner();
  if (!ctx) redirect("/login");
  if (!ctx.owner.totpEnrolled) redirect("/totp-setup");

  const state = await prisma.appState.findUnique({ where: { id: 1 } });
  const csrf = await getCsrfToken();
  if (!csrf) redirect("/login");

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Test mode</h1>
        <Link href="/dashboard" className="text-sm text-neutral-400">
          &larr; Dashboard
        </Link>
      </header>

      <section className="rounded border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200">
        When test mode is on, release simulations only include files flagged
        <code className="mx-1 rounded bg-neutral-900 px-1">isSample=true</code>
        and only notify the owner&apos;s own contact methods. Real files and
        real recipients are never touched.
      </section>

      <TestModeClient csrf={csrf} testMode={!!state?.testMode} />
    </main>
  );
}
