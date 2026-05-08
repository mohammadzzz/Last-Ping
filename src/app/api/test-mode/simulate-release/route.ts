import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/guards/require-owner";
import { verifyCsrf } from "@/server/auth/csrf";
import { triggerRelease } from "@/server/jobs/release";
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

  const result = await triggerRelease({ trigger: "TEST", isTest: true });
  await audit("owner", "SIMULATE_RELEASE", {
    targetType: "owner",
    targetId: ctx.owner.id,
    metadata: result,
  });
  return NextResponse.json({ ok: true, result });
}
