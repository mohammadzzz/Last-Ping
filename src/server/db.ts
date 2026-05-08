import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __lp_prisma?: PrismaClient };

function build(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.__lp_prisma) {
      globalForPrisma.__lp_prisma = build();
    }
    const client = globalForPrisma.__lp_prisma as unknown as Record<string | symbol, unknown>;
    return client[prop as string];
  },
});

export function setPrismaForTesting(p: PrismaClient) {
  globalForPrisma.__lp_prisma = p;
}
