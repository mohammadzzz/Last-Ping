import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getTestDb, resetDb, type TestDb } from "../helpers/db";
import type { PrismaClient } from "@prisma/client";

let db: TestDb;
let prisma: PrismaClient;
let POST: (req: NextRequest) => Promise<Response>;
let hashSecret: (s: string) => Promise<string>;

beforeAll(async () => {
  db = await getTestDb();
  prisma = db.prisma;
  const { setPrismaForTesting } = await import("../../src/server/db");
  setPrismaForTesting(prisma);
  ({ POST } = await import("../../src/app/api/checkin/link/status/route"));
  ({ hashSecret } = await import("../../src/server/auth/password"));
}, 120_000);
afterAll(async () => {
  await db.stop();
});

const TOKEN = "abcdef0123456789abcdef0123456789";
const PIN = "123456";

async function seed() {
  const pinHash = await hashSecret(PIN);
  await prisma.owner.create({
    data: {
      email: "o@test.test",
      passwordHash: await hashSecret("loginpassword"),
      totpSecretEnc: Buffer.alloc(60),
      checkinPinHash: pinHash,
      checkinLinkToken: TOKEN,
    },
  });
  await prisma.appState.create({
    data: { id: 1, mode: "ACTIVE", lastCheckinAt: new Date() },
  });
}

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/checkin/link/status", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkin/link/status", () => {
  beforeEach(async () => {
    await resetDb(prisma);
    await seed();
  });

  it("returns 200 with state view on valid token+PIN", async () => {
    const res = await POST(makeReq({ token: TOKEN, pin: PIN }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe("ACTIVE");
    expect(typeof body.secondsToWarning).toBe("number");
    expect(typeof body.secondsToRelease).toBe("number");
    expect(typeof body.lastCheckinAt).toBe("string");
    expect(body.testMode).toBe(false);
  });

  it("does not insert a CheckinRecord", async () => {
    const before = await prisma.checkinRecord.count();
    await POST(makeReq({ token: TOKEN, pin: PIN }));
    const after = await prisma.checkinRecord.count();
    expect(after).toBe(before);
  });

  it("does not advance lastCheckinAt", async () => {
    const before = await prisma.appState.findUnique({ where: { id: 1 } });
    await POST(makeReq({ token: TOKEN, pin: PIN }));
    const after = await prisma.appState.findUnique({ where: { id: 1 } });
    expect(after!.lastCheckinAt.getTime()).toBe(before!.lastCheckinAt.getTime());
    expect(after!.mode).toBe(before!.mode);
  });

  it("returns 401 on bad token", async () => {
    const res = await POST(makeReq({ token: "z".repeat(32), pin: PIN }));
    expect(res.status).toBe(401);
  });

  it("returns 401 on bad PIN", async () => {
    const res = await POST(makeReq({ token: TOKEN, pin: "wrong-pin" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on malformed body", async () => {
    const res = await POST(makeReq({ token: "short", pin: PIN }));
    expect(res.status).toBe(400);
  });

  it("rate-limits after policy.checkinLink.max attempts", async () => {
    // Exhaust the per-IP bucket using bad PIN attempts.
    let last: Response | null = null;
    for (let i = 0; i < 10; i++) {
      last = await POST(makeReq({ token: TOKEN, pin: "wrong-pin" }));
    }
    expect(last!.status).toBe(429);
  });
});
