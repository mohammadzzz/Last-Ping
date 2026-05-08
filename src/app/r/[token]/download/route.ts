import { NextRequest } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@/server/db";
import { requireVerifiedRecipient } from "@/server/guards/require-recipient";
import { buildRecipientZip } from "@/server/storage/zip";
import { hashIp } from "@/server/crypto/tokens";
import { env } from "@/lib/env";
import { getClock } from "@/lib/clock";
import { audit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const r = await requireVerifiedRecipient(token);
  if ("error" in r) {
    const status =
      r.error === "not_found" ? 404 : r.error === "gone" ? 410 : r.error === "unverified" ? 401 : 403;
    return new Response(r.error, { status });
  }
  const rr = r.rr;

  if (rr.status === "DELETED") return new Response("gone", { status: 410 });

  // Build ZIP once, reuse on subsequent Range resumes.
  let zipPath = rr.zipPath;
  let zipSize = rr.zipSizeBytes ? Number(rr.zipSizeBytes) : null;
  if (!zipPath || !zipSize) {
    const built = await buildRecipientZip(rr.id);
    zipPath = built.path;
    zipSize = built.sizeBytes;
    await prisma.releaseRecipient.update({
      where: { id: rr.id },
      data: { zipPath, zipSizeBytes: BigInt(built.sizeBytes), status: "DOWNLOADING" },
    });
    await audit(`recipient:${rr.recipientId}`, "ZIP_BUILT", {
      targetType: "releaseRecipient",
      targetId: rr.id,
      metadata: { sizeBytes: built.sizeBytes },
    });
  }

  const stat = statSync(zipPath);
  const total = stat.size;

  const rangeHeader = req.headers.get("range");
  let start = 0;
  let end = total - 1;
  let status = 200;
  if (rangeHeader) {
    const m = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader);
    if (!m) return new Response("invalid range", { status: 416 });
    start = parseInt(m[1]!, 10);
    end = m[2] ? parseInt(m[2], 10) : total - 1;
    if (start > end || end >= total) return new Response("invalid range", { status: 416 });
    status = 206;
  }
  const length = end - start + 1;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const session = await prisma.downloadSession.create({
    data: {
      releaseRecipientId: rr.id,
      bytesExpected: BigInt(length),
      clientIpHash: hashIp(ip, env().IP_HASH_SALT),
      userAgent: (req.headers.get("user-agent") ?? "").slice(0, 256),
    },
  });

  const fileStream = createReadStream(zipPath, { start, end });
  let bytesServed = 0;
  let settled = false;

  const settle = async (completed: boolean) => {
    if (settled) return;
    settled = true;
    const now = getClock().now();
    await prisma.downloadSession.update({
      where: { id: session.id },
      data: {
        bytesServed: BigInt(bytesServed),
        completedAt: completed ? now : null,
      },
    });

    if (completed && status === 200) {
      await markCompleted(rr.id);
    } else if (completed && status === 206) {
      const agg = await prisma.downloadSession.aggregate({
        where: { releaseRecipientId: rr.id, completedAt: { not: null } },
        _sum: { bytesServed: true },
      });
      if ((agg._sum.bytesServed ?? 0n) >= BigInt(total)) {
        await markCompleted(rr.id);
      }
    }
  };

  const tap = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesServed += chunk.byteLength;
      controller.enqueue(chunk);
    },
    async flush() {
      await settle(bytesServed === length);
    },
  });

  const web = Readable.toWeb(fileStream) as unknown as ReadableStream<Uint8Array>;
  const body = web.pipeThrough(tap);
  fileStream.on("error", () => settle(false).catch(() => {}));

  const headers = new Headers({
    "content-type": "application/zip",
    "content-length": String(length),
    "accept-ranges": "bytes",
    "content-disposition": `attachment; filename="last-ping-${rr.recipientId}.zip"`,
  });
  if (status === 206) {
    headers.set("content-range", `bytes ${start}-${end}/${total}`);
  }

  return new Response(body, { status, headers });
}

async function markCompleted(releaseRecipientId: string) {
  const now = getClock().now();
  const rr = await prisma.releaseRecipient.findUnique({ where: { id: releaseRecipientId } });
  if (!rr || rr.status === "DOWNLOADED" || rr.status === "DELETED") return;

  const deleteAfter = new Date(now.getTime() + env().POST_DOWNLOAD_RETENTION_SECONDS * 1000);
  await prisma.$transaction([
    prisma.releaseRecipient.update({
      where: { id: releaseRecipientId },
      data: { status: "DOWNLOADED", downloadCompletedAt: now, deleteAfter },
    }),
    prisma.deletionJob.upsert({
      where: { releaseRecipientId },
      update: { scheduledFor: deleteAfter, status: "PENDING", executedAt: null, error: null },
      create: { releaseRecipientId, scheduledFor: deleteAfter },
    }),
  ]);
  await audit(`recipient:${rr.recipientId}`, "DOWNLOAD_COMPLETE", {
    targetType: "releaseRecipient",
    targetId: releaseRecipientId,
    metadata: { deleteAfter: deleteAfter.toISOString() },
  });
}
