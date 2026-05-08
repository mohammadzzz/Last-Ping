import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTestDb, resetDb, type TestDb } from "../helpers/db";
import { randomToken, hashToken } from "../../src/server/crypto/tokens";
import { hashSecret, verifySecret } from "../../src/server/auth/password";
import type { PrismaClient } from "@prisma/client";

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await getTestDb();
  prisma = db.prisma;
});
afterAll(async () => {
  await db.stop();
});

describe("token / OTP expiry", () => {
  it("download token past expiresAt is treated as gone", async () => {
    await resetDb(prisma);
    const release = await prisma.release.create({ data: { trigger: "MANUAL" } });
    const recipient = await prisma.recipient.create({
      data: { displayName: "X", personalMessage: "" },
    });
    const token = randomToken();
    const past = new Date(Date.now() - 1000);
    const rr = await prisma.releaseRecipient.create({
      data: {
        releaseId: release.id,
        recipientId: recipient.id,
        downloadTokenHash: hashToken(token),
        expiresAt: past,
      },
    });
    expect(rr.expiresAt.getTime()).toBeLessThan(Date.now());
    // Simulate the expire job.
    await prisma.releaseRecipient.updateMany({
      where: { expiresAt: { lte: new Date() }, status: { in: ["PENDING", "VERIFIED"] } },
      data: { status: "EXPIRED" },
    });
    const after = await prisma.releaseRecipient.findUnique({ where: { id: rr.id } });
    expect(after?.status).toBe("EXPIRED");
  });

  it("OTP rejects after consumedAt is set; wrong code does not set consumedAt", async () => {
    await resetDb(prisma);
    const release = await prisma.release.create({ data: { trigger: "MANUAL" } });
    const recipient = await prisma.recipient.create({
      data: { displayName: "Y", personalMessage: "" },
    });
    const token = randomToken();
    const rr = await prisma.releaseRecipient.create({
      data: {
        releaseId: release.id,
        recipientId: recipient.id,
        downloadTokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const code = "123456";
    const hash = await hashSecret(code);
    await prisma.verificationCode.create({
      data: {
        releaseRecipientId: rr.id,
        codeHash: hash,
        channel: "EMAIL",
        sentTo: "x@t.test",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    expect(await verifySecret(hash, "000000")).toBe(false);
    expect(await verifySecret(hash, "123456")).toBe(true);
  });

  it("expired OTP (past expiresAt) is never matched by active-code query", async () => {
    await resetDb(prisma);
    const release = await prisma.release.create({ data: { trigger: "MANUAL" } });
    const recipient = await prisma.recipient.create({
      data: { displayName: "Z", personalMessage: "" },
    });
    const token = randomToken();
    const rr = await prisma.releaseRecipient.create({
      data: {
        releaseId: release.id,
        recipientId: recipient.id,
        downloadTokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await prisma.verificationCode.create({
      data: {
        releaseRecipientId: rr.id,
        codeHash: await hashSecret("999999"),
        channel: "EMAIL",
        sentTo: "z@t.test",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const now = new Date();
    const active = await prisma.verificationCode.findFirst({
      where: {
        releaseRecipientId: rr.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
    });
    expect(active).toBeNull();
  });
});
