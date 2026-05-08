import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/guards/require-owner";
import { verifyCsrf } from "@/server/auth/csrf";
import { audit } from "@/server/audit";

const createSchema = z.object({
  csrf: z.string(),
  displayName: z.string().min(1).max(100),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  telegramChatId: z.string().max(64).optional().nullable(),
  whatsappNumber: z.string().max(32).optional().nullable(),
  preferredOtpChannel: z.enum(["EMAIL", "SMS"]).default("EMAIL"),
  personalMessage: z.string().max(20_000).default(""),
});

export async function GET() {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const recipients = await prisma.recipient.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { assignments: true } } },
  });
  return NextResponse.json({ recipients });
}

export async function POST(req: NextRequest) {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  }
  if (!(await verifyCsrf(parsed.data.csrf))) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }
  const { csrf: _csrf, ...data } = parsed.data;

  if (data.preferredOtpChannel === "EMAIL" && !data.email) {
    return NextResponse.json({ error: "email required for EMAIL OTP" }, { status: 400 });
  }
  if (data.preferredOtpChannel === "SMS" && !data.phone) {
    return NextResponse.json({ error: "phone required for SMS OTP" }, { status: 400 });
  }

  const created = await prisma.recipient.create({ data });
  await audit("owner", "RECIPIENT_CREATE", { targetType: "recipient", targetId: created.id });

  return NextResponse.json({ recipient: created });
}
