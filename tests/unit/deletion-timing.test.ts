import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { getTestDb, resetDb, type TestDb } from "../helpers/db";
import type { PrismaClient } from "@prisma/client";
import { env } from "../../src/lib/env";

let db: TestDb;
let prisma: PrismaClient;
let tmpRoot: string;

beforeAll(async () => {
  // Dedicated DATA_DIR for this test.
  tmpRoot = path.join(tmpdir(), `lp-del-${Date.now()}`);
  mkdirSync(path.join(tmpRoot, "tmp"), { recursive: true });
  mkdirSync(path.join(tmpRoot, "files"), { recursive: true });
  process.env.DATA_DIR = tmpRoot;

  db = await getTestDb();
  prisma = db.prisma;
  const { setPrismaForTesting } = await import("../../src/server/db");
  setPrismaForTesting(prisma);
});
afterAll(async () => {
  await db.stop();
});
beforeEach(async () => {
  await resetDb(prisma);
});

async function seedDownloaded(deleteAfter: Date) {
  const release = await prisma.release.create({ data: { trigger: "MANUAL" } });
  const recipient = await prisma.recipient.create({
    data: { displayName: "A", email: "a@t.test", personalMessage: "" },
  });
  const rrId = crypto.randomUUID();
  const zipPath = path.join(tmpRoot, "tmp", `${rrId}.zip`);
  writeFileSync(zipPath, Buffer.from("fakezip"));
  const rr = await prisma.releaseRecipient.create({
    data: {
      id: rrId,
      releaseId: release.id,
      recipientId: recipient.id,
      downloadTokenHash: "x".repeat(64),
      expiresAt: new Date(Date.now() + 86400_000),
      status: "DOWNLOADED",
      downloadCompletedAt: new Date(),
      deleteAfter,
      zipPath,
    },
  });
  await prisma.deletionJob.create({
    data: { releaseRecipientId: rr.id, scheduledFor: deleteAfter },
  });
  return { rr, zipPath };
}

describe("deletion timing", () => {
  it("does NOT delete the ZIP before scheduledFor", async () => {
    const future = new Date(Date.now() + env().POST_DOWNLOAD_RETENTION_SECONDS * 1000);
    const { rr, zipPath } = await seedDownloaded(future);

    const { runExecuteDeletions } = await import("../../src/server/jobs/execute-deletions");
    await runExecuteDeletions();
    expect(existsSync(zipPath)).toBe(true);
    const job = await prisma.deletionJob.findUnique({ where: { releaseRecipientId: rr.id } });
    expect(job?.status).toBe("PENDING");
  });

  it("deletes the ZIP at scheduledFor and marks RR as DELETED", async () => {
    const past = new Date(Date.now() - 1000);
    const { rr, zipPath } = await seedDownloaded(past);

    const { runExecuteDeletions } = await import("../../src/server/jobs/execute-deletions");
    await runExecuteDeletions();

    expect(existsSync(zipPath)).toBe(false);
    const after = await prisma.releaseRecipient.findUnique({ where: { id: rr.id } });
    expect(after?.status).toBe("DELETED");
    expect(after?.zipPath).toBeNull();
    const job = await prisma.deletionJob.findUnique({ where: { releaseRecipientId: rr.id } });
    expect(job?.status).toBe("DONE");
    expect(job?.executedAt).not.toBeNull();
  });

  it("original MediaFile rows are never touched by deletion jobs", async () => {
    const past = new Date(Date.now() - 1000);
    const { rr } = await seedDownloaded(past);
    const mf = await prisma.mediaFile.create({
      data: {
        originalName: "k.bin",
        mimeType: "application/octet-stream",
        sizeBytes: BigInt(1),
        storagePath: "/data/files/k.enc",
        nonce: Buffer.alloc(12),
        authTag: Buffer.alloc(16),
        wrappedDek: Buffer.alloc(60),
        sha256: "0".repeat(64),
        assignments: { create: { recipientId: rr.recipientId } },
      },
    });

    const { runExecuteDeletions } = await import("../../src/server/jobs/execute-deletions");
    await runExecuteDeletions();

    const stillThere = await prisma.mediaFile.findUnique({ where: { id: mf.id } });
    expect(stillThere).not.toBeNull();
  });

  it("expire-undownloaded deletes ZIPs for PENDING rows past expiresAt", async () => {
    const release = await prisma.release.create({ data: { trigger: "MANUAL" } });
    const recipient = await prisma.recipient.create({
      data: { displayName: "E", email: "e@t.test", personalMessage: "" },
    });
    const rrId = crypto.randomUUID();
    const zipPath = path.join(tmpRoot, "tmp", `${rrId}.zip`);
    writeFileSync(zipPath, Buffer.from("z"));
    await prisma.releaseRecipient.create({
      data: {
        id: rrId,
        releaseId: release.id,
        recipientId: recipient.id,
        downloadTokenHash: "y".repeat(64),
        expiresAt: new Date(Date.now() - 1000),
        status: "VERIFIED",
        zipPath,
      },
    });
    const { runExpireUndownloaded } = await import("../../src/server/jobs/expire-undownloaded");
    await runExpireUndownloaded();
    expect(existsSync(zipPath)).toBe(false);
    const rr = await prisma.releaseRecipient.findUnique({ where: { id: rrId } });
    expect(rr?.status).toBe("EXPIRED");
  });
});
