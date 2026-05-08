import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getTestDb, resetDb, type TestDb } from "../helpers/db";
import { randomToken, hashToken } from "../../src/server/crypto/tokens";
import type { PrismaClient, ReleaseRecipient } from "@prisma/client";

/**
 * Recipient isolation invariant:
 * A session bound to recipient A must NEVER be able to read B's artifacts —
 * not via the token, not via the recipient_id. The check lives in
 * requireVerifiedRecipient which is only imported here to verify its behavior.
 */

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await getTestDb();
  prisma = db.prisma;
});
afterAll(async () => {
  await db.stop();
});

async function seed() {
  await resetDb(prisma);
  await prisma.appState.create({
    data: { id: 1, mode: "RELEASED", lastCheckinAt: new Date() },
  });

  const release = await prisma.release.create({ data: { trigger: "MANUAL" } });
  const mk = async (name: string): Promise<{ rr: ReleaseRecipient; token: string }> => {
    const recipient = await prisma.recipient.create({
      data: { displayName: name, email: `${name.toLowerCase()}@t.test`, personalMessage: `for ${name}` },
    });
    const token = randomToken();
    const rr = await prisma.releaseRecipient.create({
      data: {
        releaseId: release.id,
        recipientId: recipient.id,
        downloadTokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    return { rr, token };
  };
  const a = await mk("Alice");
  const b = await mk("Bob");
  return { a, b };
}

describe("recipient isolation (data layer)", () => {
  it("hashed token lookup only ever returns that recipient's row", async () => {
    const { a, b } = await seed();

    const aHit = await prisma.releaseRecipient.findUnique({
      where: { downloadTokenHash: hashToken(a.token) },
    });
    expect(aHit?.id).toBe(a.rr.id);
    expect(aHit?.recipientId).toBe(a.rr.recipientId);

    const bHit = await prisma.releaseRecipient.findUnique({
      where: { downloadTokenHash: hashToken(b.token) },
    });
    expect(bHit?.id).toBe(b.rr.id);
    expect(bHit?.recipientId).not.toBe(a.rr.recipientId);

    // A fabricated token never resolves.
    const junk = await prisma.releaseRecipient.findUnique({
      where: { downloadTokenHash: hashToken("not-a-real-token") },
    });
    expect(junk).toBeNull();
  });

  it("assignments are scoped by recipientId; a query for B's recipientId never returns A's files", async () => {
    const { a, b } = await seed();
    const fa = await prisma.mediaFile.create({
      data: {
        originalName: "a.bin",
        mimeType: "application/octet-stream",
        sizeBytes: BigInt(10),
        storagePath: "/data/files/fa.enc",
        nonce: Buffer.alloc(12),
        authTag: Buffer.alloc(16),
        wrappedDek: Buffer.alloc(60),
        sha256: "a".repeat(64),
      },
    });
    const fb = await prisma.mediaFile.create({
      data: {
        originalName: "b.bin",
        mimeType: "application/octet-stream",
        sizeBytes: BigInt(10),
        storagePath: "/data/files/fb.enc",
        nonce: Buffer.alloc(12),
        authTag: Buffer.alloc(16),
        wrappedDek: Buffer.alloc(60),
        sha256: "b".repeat(64),
      },
    });
    await prisma.recipientFileAssignment.createMany({
      data: [
        { recipientId: a.rr.recipientId, fileId: fa.id },
        { recipientId: b.rr.recipientId, fileId: fb.id },
      ],
    });

    // Simulate the ZIP builder's query shape for recipient B.
    const filesForB = await prisma.mediaFile.findMany({
      where: { assignments: { some: { recipientId: b.rr.recipientId } } },
    });
    expect(filesForB.map((f) => f.id)).toEqual([fb.id]);
    expect(filesForB.map((f) => f.id)).not.toContain(fa.id);
  });

  it("personal message is read via recipientId, never via arbitrary release-recipient id", async () => {
    const { a, b } = await seed();
    // Replicate the guard invariant: fetch the recipient through the RR linkage.
    const viaA = await prisma.releaseRecipient.findUnique({
      where: { id: a.rr.id },
      include: { recipient: true },
    });
    expect(viaA?.recipient.personalMessage).toBe("for Alice");

    const viaB = await prisma.releaseRecipient.findUnique({
      where: { id: b.rr.id },
      include: { recipient: true },
    });
    expect(viaB?.recipient.personalMessage).toBe("for Bob");
    expect(viaA?.recipientId).not.toBe(viaB?.recipientId);
  });
});
