import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/guards/require-owner";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  const ctx = await requireOwner();
  if (!ctx) redirect("/login");
  if (!ctx.owner.totpEnrolled) redirect("/totp-setup");

  const rows = await prisma.releaseRecipient.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      recipient: { select: { displayName: true } },
      release: { select: { trigger: true, isTest: true, triggeredAt: true } },
      _count: { select: { sessions: true } },
    },
    take: 500,
  });

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Deliveries</h1>
        <Link href="/dashboard" className="text-sm text-neutral-400">
          &larr; Dashboard
        </Link>
      </header>

      <table className="w-full text-sm">
        <thead className="text-left text-neutral-400">
          <tr>
            <th className="py-2">Recipient</th>
            <th>Trigger</th>
            <th>Status</th>
            <th>Released</th>
            <th>Downloaded</th>
            <th>Delete after</th>
            <th>Sessions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-neutral-800">
              <td className="py-1">{r.recipient.displayName}</td>
              <td>
                {r.release.trigger}
                {r.release.isTest && (
                  <span className="ml-1 rounded bg-amber-800 px-1 py-0.5 text-xs">test</span>
                )}
              </td>
              <td>{r.status}</td>
              <td className="font-mono text-xs">{r.createdAt.toISOString()}</td>
              <td className="font-mono text-xs">
                {r.downloadCompletedAt?.toISOString() ?? "—"}
              </td>
              <td className="font-mono text-xs">
                {r.deleteAfter?.toISOString() ?? "—"}
              </td>
              <td>{r._count.sessions}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-center text-neutral-500">
                No deliveries yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
