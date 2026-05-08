import { NextResponse } from "next/server";
import { getOwnerSession } from "@/server/auth/session";
import { audit } from "@/server/audit";

export async function POST() {
  const s = await getOwnerSession();
  const ownerId = s.ownerId;
  s.destroy();
  if (ownerId) await audit("owner", "LOGOUT", { targetType: "owner", targetId: ownerId });
  return NextResponse.json({ ok: true });
}
