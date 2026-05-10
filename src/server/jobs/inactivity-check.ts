import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import { getClock } from "@/lib/clock";
import { effectiveAgeSeconds } from "@/server/state";
import { audit } from "@/server/audit";
import { createLogger } from "@/lib/logger";
import { triggerRelease } from "./release";

const log = createLogger("inactivity-check");

/**
 * Read app state age. Transition ACTIVE -> WARNING at WARNING_AFTER_SECONDS,
 * trigger release at RELEASE_AFTER_SECONDS. Idempotent: re-running is a no-op
 * after transition.
 */
export async function runInactivityCheck() {
  const state = await prisma.appState.findUnique({ where: { id: 1 } });
  if (!state) return;
  const age = await effectiveAgeSeconds();
  const now = getClock().now();

  if (age >= env().RELEASE_AFTER_SECONDS && state.mode !== "RELEASED") {
    log.warn(
      { from: state.mode, to: "RELEASED", ageSeconds: age },
      "state transition: inactivity release",
    );
    await audit("system", "INACTIVITY_RELEASE", { metadata: { ageSeconds: age } });
    await triggerRelease({ trigger: "INACTIVITY" });
    return;
  }

  if (age >= env().WARNING_AFTER_SECONDS && state.mode === "ACTIVE") {
    log.warn(
      { from: "ACTIVE", to: "WARNING", ageSeconds: age },
      "state transition: inactivity warning",
    );
    await prisma.appState.update({
      where: { id: 1 },
      data: { mode: "WARNING", warningStartedAt: state.warningStartedAt ?? now },
    });
    await audit("system", "INACTIVITY_WARNING", { metadata: { ageSeconds: age } });
  }
}
