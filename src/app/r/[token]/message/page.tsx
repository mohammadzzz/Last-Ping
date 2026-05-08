import { notFound } from "next/navigation";
import { requireVerifiedRecipient } from "@/server/guards/require-recipient";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function MessagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const r = await requireVerifiedRecipient(token);
  if ("error" in r) {
    if (r.error === "not_found") return notFound();
    if (r.error === "gone") {
      return (
        <main className="mx-auto max-w-lg p-8">
          <h1 className="mb-3 text-xl font-semibold">This link has expired</h1>
        </main>
      );
    }
    // unverified / forbidden
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="mb-3 text-xl font-semibold">Verification required</h1>
        <p className="text-sm text-neutral-400">
          <a className="text-indigo-300 underline" href={`/r/${token}`}>
            Go back and verify
          </a>
          .
        </p>
      </main>
    );
  }

  const files = await prisma.mediaFile.findMany({
    where: {
      assignments: { some: { recipientId: r.rr.recipientId } },
      ...(r.rr.release.isTest ? { isSample: true } : {}),
    },
    select: { id: true, originalName: true, sizeBytes: true },
  });
  const totalBytes = files.reduce((a, f) => a + Number(f.sizeBytes), 0);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">Hello, {r.rr.recipient.displayName}</h1>
      </header>

      <section className="rounded border border-neutral-800 p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-300">Personal message</h2>
        <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-100">
          {r.rr.recipient.personalMessage || "(no message)"}
        </pre>
      </section>

      <section className="rounded border border-neutral-800 p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-300">Files</h2>
        {files.length === 0 ? (
          <p className="text-sm text-neutral-500">No files.</p>
        ) : (
          <>
            <ul className="mb-4 divide-y divide-neutral-800 text-sm">
              {files.map((f) => (
                <li key={f.id} className="flex justify-between py-2">
                  <span>{f.originalName}</span>
                  <span className="text-neutral-500">{fmtBytes(Number(f.sizeBytes))}</span>
                </li>
              ))}
            </ul>
            <p className="mb-3 text-sm text-neutral-400">
              Total: {fmtBytes(totalBytes)} — one ZIP archive.
            </p>
            <a
              href={`/r/${token}/download`}
              className="inline-block rounded bg-emerald-600 px-4 py-2 font-medium"
            >
              Download ZIP
            </a>
            {r.rr.status === "DOWNLOADED" && (
              <p className="mt-2 text-xs text-neutral-500">
                Already downloaded. Will be available until{" "}
                {r.rr.deleteAfter?.toUTCString()}.
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
