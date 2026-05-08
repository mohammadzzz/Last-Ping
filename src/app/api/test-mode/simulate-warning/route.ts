import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/guards/require-owner";
import { verifyCsrf } from "@/server/auth/csrf";
import { runDailyWarnings } from "@/server/jobs/daily-warnings";
import { audit } from "@/server/audit";

export async function POST(req: NextRequest) {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }

  const state = await prisma.appState.findUnique({ where: { id: 1 } });
  if (!state?.testMode) {
    return NextResponse.json({ error: "enable test mode first" }, { status: 400 });
  }

  // Force WARNING state for the duration of this job call, then restore.
  const prior = { mode: state.mode, warningStartedAt: state.warningStartedAt };
  await prisma.appState.update({
    where: { id: 1 },
    data: { mode: "WARNING", warningStartedAt: state.warningStartedAt ?? new Date() },
  });
  try {
    await runDailyWarnings();
  } finally {
    await prisma.appState.update({
      where: { id: 1 },
      data: { mode: prior.mode, warningStartedAt: prior.warningStartedAt },
    });
  }
  await audit("owner", "SIMULATE_WARNING", { targetType: "owner", targetId: ctx.owner.id });
  return NextResponse.json({ ok: true });
}
