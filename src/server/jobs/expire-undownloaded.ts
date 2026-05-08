import { prisma } from "@/server/db";
import { getClock } from "@/lib/clock";
import { removeIfExists } from "@/server/storage/files";
import { audit } from "@/server/audit";

export async function runExpireUndownloaded() {
  const now = getClock().now();
  const candidates = await prisma.releaseRecipient.findMany({
    where: {
      expiresAt: { lte: now },
      status: { in: ["PENDING", "VERIFIED"] },
    },
  });
  for (const rr of candidates) {
    if (rr.zipPath) await removeIfExists(rr.zipPath).catch(() => {});
    await prisma.releaseRecipient.update({
      where: { id: rr.id },
      data: { status: "EXPIRED", zipPath: null },
    });
    await audit("system", "RELEASE_EXPIRED", {
      targetType: "releaseRecipient",
      targetId: rr.id,
    });
  }
}
