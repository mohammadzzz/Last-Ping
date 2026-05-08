import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTestDb, resetDb, type TestDb } from "../helpers/db";
import { runInactivityCheck } from "../../src/server/jobs/inactivity-check";
import { env } from "../../src/lib/env";
import type { PrismaClient } from "@prisma/client";

let db: TestDb;
let prisma: PrismaClient;

// Override the shared prisma client used by the job.
beforeAll(async () => {
  db = await getTestDb();
  prisma = db.prisma;
  const { setPrismaForTesting } = await import("../../src/server/db");
  setPrismaForTesting(prisma);
});
afterAll(async () => {
  await db.stop();
});

describe("check-in reset", () => {
  it("transitions ACTIVE -> WARNING once threshold is past", async () => {
    await resetDb(prisma);
    const old = new Date(Date.now() - (env().WARNING_AFTER_SECONDS + 60) * 1000);
    await prisma.appState.create({
      data: { id: 1, mode: "ACTIVE", lastCheckinAt: old },
    });
    await runInactivityCheck();
    const s = await prisma.appState.findUnique({ where: { id: 1 } });
    expect(s?.mode).toBe("WARNING");
    expect(s?.warningStartedAt).not.toBeNull();
  });

  it("check-in resets state: lastCheckinAt advances, warningStartedAt cleared, mode ACTIVE", async () => {
    await resetDb(prisma);
    const old = new Date(Date.now() - (env().WARNING_AFTER_SECONDS + 60) * 1000);
    await prisma.appState.create({
      data: {
        id: 1,
        mode: "WARNING",
        lastCheckinAt: old,
        warningStartedAt: new Date(Date.now() - 3600_000),
      },
    });
    // Simulate the check-in endpoint's transaction.
    const now = new Date();
    await prisma.appState.update({
      where: { id: 1 },
      data: { mode: "ACTIVE", lastCheckinAt: now, warningStartedAt: null },
    });
    const s = await prisma.appState.findUnique({ where: { id: 1 } });
    expect(s?.mode).toBe("ACTIVE");
    expect(s?.warningStartedAt).toBeNull();
    expect(Math.abs(s!.lastCheckinAt.getTime() - now.getTime())).toBeLessThan(2000);

    // Running the inactivity check immediately after reset should be a no-op.
    await runInactivityCheck();
    const s2 = await prisma.appState.findUnique({ where: { id: 1 } });
    expect(s2?.mode).toBe("ACTIVE");
  });

  it("transitions to RELEASED when past release threshold even if not yet WARNING", async () => {
    await resetDb(prisma);
    const recipient = await prisma.recipient.create({
      data: { displayName: "R", email: "r@t.test", personalMessage: "hi" },
    });
    await prisma.mediaFile.create({
      data: {
        originalName: "x.bin",
        mimeType: "application/octet-stream",
        sizeBytes: BigInt(1),
        storagePath: "/data/files/x.enc",
        nonce: Buffer.alloc(12),
        authTag: Buffer.alloc(16),
        wrappedDek: Buffer.alloc(60),
        sha256: "f".repeat(64),
        assignments: { create: { recipientId: recipient.id } },
      },
    });
    const old = new Date(Date.now() - (env().RELEASE_AFTER_SECONDS + 60) * 1000);
    await prisma.appState.create({
      data: { id: 1, mode: "ACTIVE", lastCheckinAt: old },
    });
    await runInactivityCheck();
    const s = await prisma.appState.findUnique({ where: { id: 1 } });
    expect(s?.mode).toBe("RELEASED");
    expect(s?.releasedAt).not.toBeNull();
    const rrs = await prisma.releaseRecipient.findMany();
    expect(rrs.length).toBe(1);
  });
});
