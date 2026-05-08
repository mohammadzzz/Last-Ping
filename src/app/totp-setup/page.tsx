import { redirect } from "next/navigation";
import { requireOwner } from "@/server/guards/require-owner";
import { getCsrfToken } from "@/server/auth/csrf";
import { unwrapString } from "@/server/crypto/kek";
import { totpQrDataUrl, totpUri } from "@/server/auth/totp";
import { TotpVerifyForm } from "./form";

export default async function TotpSetupPage() {
  const ctx = await requireOwner();
  if (!ctx) redirect("/login");
  if (ctx.owner.totpEnrolled) redirect("/dashboard");

  const secret = unwrapString(
    Buffer.from(ctx.owner.totpSecretEnc),
    `owner:${ctx.owner.id}:totp`,
  );
  const [qr, csrf] = await Promise.all([
    totpQrDataUrl(ctx.owner.email, secret),
    getCsrfToken(),
  ]);
  if (!csrf) redirect("/login");

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-2xl font-semibold">Enrol TOTP</h1>
      <p className="mb-4 text-sm text-neutral-400">
        Scan this with your authenticator app, then enter a code to confirm.
      </p>
      <img src={qr} alt="TOTP QR" className="mb-3 rounded bg-white p-2" width={220} height={220} />
      <code className="block break-all text-xs text-neutral-500">
        {totpUri(ctx.owner.email, secret)}
      </code>
      <div className="mt-6">
        <TotpVerifyForm csrf={csrf} />
      </div>
    </main>
  );
}
