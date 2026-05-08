import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwner } from "@/server/guards/require-owner";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const ctx = await requireOwner();
  if (!ctx) redirect("/login");
  if (!ctx.owner.totpEnrolled) redirect("/totp-setup");

  const entries = await prisma.auditLog.findMany({
    orderBy: { at: "desc" },
    take: 500,
  });

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <Link href="/dashboard" className="text-sm text-neutral-400">
          &larr; Dashboard
        </Link>
      </header>
      <table className="w-full text-sm">
        <thead className="text-left text-neutral-400">
          <tr>
            <th className="py-2">When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Metadata</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-t border-neutral-800 align-top">
              <td className="py-1 font-mono text-xs text-neutral-400">
                {e.at.toISOString()}
              </td>
              <td className="font-mono text-xs">{e.actor}</td>
              <td className="font-medium">{e.action}</td>
              <td className="font-mono text-xs text-neutral-400">
                {e.targetType}
                {e.targetId ? `:${e.targetId.slice(0, 8)}…` : ""}
              </td>
              <td className="font-mono text-xs text-neutral-500">
                {e.metadata ? JSON.stringify(e.metadata).slice(0, 120) : ""}
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-neutral-500">
                No audit entries yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
