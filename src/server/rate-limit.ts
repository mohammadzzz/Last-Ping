import { prisma } from "@/server/db";
import { getClock } from "@/lib/clock";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  lockedUntil: Date | null;
}

export interface RateLimitPolicy {
  /** Max attempts within the window before locking. */
  max: number;
  /** Sliding window length in seconds. */
  windowSec: number;
  /** Lockout duration in seconds once `max` is reached. */
  lockoutSec: number;
}

/**
 * Consume one attempt against `key`. Returns whether the attempt is allowed.
 *
 * Atomicity: uses a short transaction. Two concurrent attempts on the same key
 * may both read the pre-increment state; the worst case is one extra allowed
 * attempt under contention, which is acceptable for our threat model (brute
 * force is driven from a single attacker, not a stampede).
 */
export async function consumeRateLimit(
  key: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const now = getClock().now();
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.rateLimitBucket.findUnique({ where: { key } });

    if (existing?.lockedUntil && existing.lockedUntil > now) {
      return {
        allowed: false,
        remaining: 0,
        lockedUntil: existing.lockedUntil,
      };
    }

    const windowStart = existing
      ? now.getTime() - existing.windowStart.getTime() > policy.windowSec * 1000
        ? now
        : existing.windowStart
      : now;

    const count = existing && windowStart === existing.windowStart ? existing.count + 1 : 1;

    let lockedUntil: Date | null = null;
    if (count > policy.max) {
      lockedUntil = new Date(now.getTime() + policy.lockoutSec * 1000);
    }

    await tx.rateLimitBucket.upsert({
      where: { key },
      update: { count, windowStart, lockedUntil },
      create: { key, count, windowStart, lockedUntil },
    });

    return {
      allowed: count <= policy.max,
      remaining: Math.max(0, policy.max - count),
      lockedUntil,
    };
  });
  return result;
}

export async function resetRateLimit(key: string) {
  await prisma.rateLimitBucket.delete({ where: { key } }).catch(() => {});
}

export const policies = {
  login: { max: 5, windowSec: 900, lockoutSec: 900 },
  checkinLink: { max: 5, windowSec: 900, lockoutSec: 900 },
  otpAttempt: { max: 5, windowSec: 600, lockoutSec: 1800 },
  otpSend: { max: 5, windowSec: 3600, lockoutSec: 3600 },
} as const satisfies Record<string, RateLimitPolicy>;
