import { prisma } from "@/server/db";
import { getClock } from "@/lib/clock";
import { removeIfExists } from "@/server/storage/files";
import { audit } from "@/server/audit";

/**
 * Execute DeletionJob rows whose scheduledFor has arrived. Deletes the ZIP
 * artifact and marks the ReleaseRecipient as DELETED. Never deletes the
 * original MediaFile rows or encrypted blobs — those remain unless the owner
 * explicitly deletes them.
 */
export async function runExecuteDeletions() {
  const now = getClock().now();
  const jobs = await prisma.deletionJob.findMany({
    where: { status: "PENDING", scheduledFor: { lte: now } },
    take: 100,
  });

  for (const job of jobs) {
    try {
      const rr = await prisma.releaseRecipient.findUnique({
        where: { id: job.releaseRecipientId },
      });
      if (rr?.zipPath) await removeIfExists(rr.zipPath);
      await prisma.releaseRecipient.update({
        where: { id: job.releaseRecipientId },
        data: { status: "DELETED", zipPath: null },
      });
      await prisma.deletionJob.update({
        where: { id: job.id },
        data: { status: "DONE", executedAt: now, error: null },
      });
      await audit("system", "ZIP_DELETED", {
        targetType: "releaseRecipient",
        targetId: job.releaseRecipientId,
      });
    } catch (err) {
      await prisma.deletionJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          executedAt: now,
          error: (err as Error).message.slice(0, 1000),
        },
      });
      await audit("system", "ZIP_DELETE_FAILED", {
        targetType: "releaseRecipient",
        targetId: job.releaseRecipientId,
        metadata: { error: (err as Error).message },
      });
    }
  }
}
