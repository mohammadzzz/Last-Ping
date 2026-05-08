import { NextResponse } from "next/server";
import { requireOwner } from "@/server/guards/require-owner";
import { unwrapString } from "@/server/crypto/kek";
import { totpQrDataUrl, totpUri } from "@/server/auth/totp";

export async function GET() {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { owner } = ctx;
  if (owner.totpEnrolled) {
    return NextResponse.json({ error: "already enrolled" }, { status: 400 });
  }
  const secret = unwrapString(Buffer.from(owner.totpSecretEnc), `owner:${owner.id}:totp`);
  const qr = await totpQrDataUrl(owner.email, secret);
  return NextResponse.json({ otpauth: totpUri(owner.email, secret), qr });
}
