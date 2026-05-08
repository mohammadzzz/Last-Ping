import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import { getClock } from "@/lib/clock";

export interface StateView {
  mode: "ACTIVE" | "WARNING" | "RELEASED";
  testMode: boolean;
  lastCheckinAt: Date;
  warningStartedAt: Date | null;
  releasedAt: Date | null;
  ageSeconds: number;
  secondsToWarning: number;
  secondsToRelease: number;
}

export async function getStateView(): Promise<StateView> {
  const now = getClock().now();
  const s = await prisma.appState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, mode: "ACTIVE", lastCheckinAt: now },
  });
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - s.lastCheckinAt.getTime()) / 1000));
  return {
    mode: s.mode,
    testMode: s.testMode,
    lastCheckinAt: s.lastCheckinAt,
    warningStartedAt: s.warningStartedAt,
    releasedAt: s.releasedAt,
    ageSeconds,
    secondsToWarning: Math.max(0, env().WARNING_AFTER_SECONDS - ageSeconds),
    secondsToRelease: Math.max(0, env().RELEASE_AFTER_SECONDS - ageSeconds),
  };
}

/** Effective age in seconds used by jobs — accelerated in test mode. */
export async function effectiveAgeSeconds(): Promise<number> {
  const now = getClock().now();
  const s = await prisma.appState.findUnique({ where: { id: 1 } });
  if (!s) return 0;
  const raw = Math.max(0, Math.floor((now.getTime() - s.lastCheckinAt.getTime()) / 1000));
  return s.testMode ? raw * env().TEST_MODE_SPEEDUP : raw;
}
