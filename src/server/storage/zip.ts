import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { prisma } from "@/server/db";
import { createDecryptStream } from "@/server/crypto/stream-cipher";
import { unwrapDek } from "@/server/crypto/kek";
import { storagePathForId, tmpPathForSession } from "@/server/storage/files";

/**
 * Build a ZIP for one ReleaseRecipient, containing ONLY files explicitly
 * assigned to that recipient. The caller is trusted to have verified the
 * recipient's identity; this function enforces the isolation invariant at the
 * query boundary (`where: { assignments: { some: { recipientId } } }`).
 *
 * Returns the zip path and its byte size.
 */
export async function buildRecipientZip(
  releaseRecipientId: string,
): Promise<{ path: string; sizeBytes: number }> {
  const rr = await prisma.releaseRecipient.findUnique({
    where: { id: releaseRecipientId },
    include: { recipient: true, release: true },
  });
  if (!rr) throw new Error("release recipient not found");

  // Only fetch files currently assigned to this recipient — no joining via file ids the caller chose.
  const files = await prisma.mediaFile.findMany({
    where: {
      assignments: { some: { recipientId: rr.recipientId } },
      // In test releases, only include sample files.
      ...(rr.release.isTest ? { isSample: true } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  const zipPath = tmpPathForSession(releaseRecipientId);
  const out = createWriteStream(zipPath, { mode: 0o600 });
  const archive = archiver("zip", { store: true });
  archive.pipe(out);

  for (const f of files) {
    const dek = unwrapDek(Buffer.from(f.wrappedDek), `file:${f.id}`);
    try {
      const dec = createDecryptStream(
        storagePathForId(f.id),
        dek,
        Buffer.from(f.nonce),
        Buffer.from(f.authTag),
        `file:${f.id}`,
      );
      archive.append(dec, { name: safeZipName(f.originalName) });
    } finally {
      dek.fill(0);
    }
  }

  // archive.finalize() resolves when all data has been written to `out`; the
  // write stream still needs its own 'close' event before stat() is valid.
  await archive.finalize();
  await new Promise<void>((resolve, reject) => {
    out.on("close", resolve);
    out.on("error", reject);
  });

  const st = await stat(zipPath);
  return { path: zipPath, sizeBytes: st.size };
}

function safeZipName(name: string): string {
  // Strip any leading slashes and parent-dir references so a crafted
  // originalName cannot influence zip layout.
  return name.replace(/^[/\\]+/, "").replace(/\.\.+/g, "_") || "file";
}
