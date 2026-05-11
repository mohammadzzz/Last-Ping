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
  ({ POST } = await import("../../src/app/api/checkin/link/history/route"));
  ({ hashSecret } = await import("../../src/server/auth/password"));
}, 120_000);
afterAll(async () => {
  await db.stop();
});

const TOKEN = "abcdef0123456789abcdef0123456789";
const PIN = "123456";

async function seed() {
  await prisma.owner.create({
    data: {
      email: "o@test.test",
      passwordHash: await hashSecret("loginpassword"),
      totpSecretEnc: Buffer.alloc(60),
      checkinPinHash: await hashSecret(PIN),
      checkinLinkToken: TOKEN,
    },
  });
  await prisma.appState.create({
    data: { id: 1, mode: "ACTIVE", lastCheckinAt: new Date() },
  });
}

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/checkin/link/history", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

async function seedCheckins(n: number) {
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    await prisma.checkinRecord.create({
      data: {
        at: new Date(now - i * 3600_000),
        source: i % 2 === 0 ? "LOGIN" : "LINK",
        ipHash: "deadbeef",
      },
    });
  }
}

describe("POST /api/checkin/link/history", () => {
  beforeEach(async () => {
    await resetDb(prisma);
    await seed();
  });

  it("returns checkins ordered by at desc", async () => {
    await seedCheckins(5);
    const res = await POST(makeReq({ token: TOKEN, pin: PIN }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { checkins: Array<{ at: string; source: string }> };
    expect(body.checkins).toHaveLength(5);
    for (let i = 1; i < body.checkins.length; i++) {
      expect(new Date(body.checkins[i - 1].at).getTime()).toBeGreaterThanOrEqual(
        new Date(body.checkins[i].at).getTime(),
      );
    }
  });

  it("respects limit parameter", async () => {
    await seedCheckins(30);
    const res = await POST(makeReq({ token: TOKEN, pin: PIN, limit: 5 }));
    const body = (await res.json()) as { checkins: unknown[] };
    expect(body.checkins).toHaveLength(5);
  });

  it("defaults to limit 20", async () => {
    await seedCheckins(30);
    const res = await POST(makeReq({ token: TOKEN, pin: PIN }));
    const body = (await res.json()) as { checkins: unknown[] };
    expect(body.checkins).toHaveLength(20);
  });

  it("rejects limit above 50", async () => {
    const res = await POST(makeReq({ token: TOKEN, pin: PIN, limit: 51 }));
    expect(res.status).toBe(400);
  });

  it("returns 401 on bad token", async () => {
    const res = await POST(makeReq({ token: "z".repeat(32), pin: PIN }));
    expect(res.status).toBe(401);
  });

  it("returns 401 on bad PIN", async () => {
    const res = await POST(makeReq({ token: TOKEN, pin: "wrong-pin" }));
    expect(res.status).toBe(401);
  });
});
