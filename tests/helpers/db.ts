import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const execFileP = promisify(execFile);

export interface TestDb {
  url: string;
  prisma: PrismaClient;
  stop: () => Promise<void>;
}

let singleton: TestDb | null = null;
let container: StartedPostgreSqlContainer | null = null;

export async function getTestDb(): Promise<TestDb> {
  if (singleton) return singleton;

  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("lastping")
    .withUsername("lastping")
    .withPassword("lastping")
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;

  // Apply schema via `prisma db push` (faster than `migrate dev` and avoids
  // needing a migrations dir checked in for the test).
  await execFileP("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: url },
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  singleton = {
    url,
    prisma,
    stop: async () => {
      await prisma.$disconnect();
      await container?.stop();
      singleton = null;
      container = null;
    },
  };
  return singleton;
}

export async function resetDb(prisma: PrismaClient) {
  // Order matters — children first.
  await prisma.$transaction([
    prisma.deletionJob.deleteMany(),
    prisma.downloadSession.deleteMany(),
    prisma.verificationCode.deleteMany(),
    prisma.notificationAttempt.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.rateLimitBucket.deleteMany(),
    prisma.checkinRecord.deleteMany(),
    prisma.releaseRecipient.deleteMany(),
    prisma.release.deleteMany(),
    prisma.recipientFileAssignment.deleteMany(),
    prisma.mediaFile.deleteMany(),
    prisma.recipient.deleteMany(),
    prisma.appState.deleteMany(),
    prisma.owner.deleteMany(),
  ]);
}
