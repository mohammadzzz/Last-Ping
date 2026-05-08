import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOwner } from "@/server/guards/require-owner";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import { getClock } from "@/lib/clock";
import { CheckinButton } from "./checkin-button";
import { getCsrfToken } from "@/server/auth/csrf";

export default async function DashboardPage() {
  const ctx = await requireOwner();
  if (!ctx) redirect("/login");
  if (!ctx.owner.totpEnrolled) redirect("/totp-setup");

  const state = await prisma.appState.findUnique({ where: { id: 1 } });
  const csrf = await getCsrfToken();
  if (!csrf) redirect("/login");
  const now = getClock().now();

  const lastCheckin = state?.lastCheckinAt ?? now;
  const ageSec = Math.max(0, Math.floor((now.getTime() - lastCheckin.getTime()) / 1000));
  const warnAt = env().WARNING_AFTER_SECONDS;
  const releaseAt = env().RELEASE_AFTER_SECONDS;
  const secondsToWarning = Math.max(0, warnAt - ageSec);
  const secondsToRelease = Math.max(0, releaseAt - ageSec);

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <nav className="text-sm text-neutral-400 space-x-3">
          <Link href="/recipients">Recipients</Link>
          <Link href="/files">Files</Link>
          <Link href="/audit">Audit</Link>
          <Link href="/deliveries">Deliveries</Link>
          <Link href="/test">Test mode</Link>
        </nav>
      </header>

      <section className="rounded border border-neutral-800 p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-sm text-neutral-400">State</p>
            <p className="text-xl font-medium">
              {state?.mode ?? "ACTIVE"}
              {state?.testMode && (
                <span className="ml-2 rounded bg-amber-800 px-2 py-0.5 text-xs">TEST MODE</span>
              )}
            </p>
          </div>
          <CheckinButton csrf={csrf} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-neutral-400">Last check-in</dt>
            <dd>{lastCheckin.toISOString()}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Time until warning</dt>
            <dd>{fmt(secondsToWarning)}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Time until release</dt>
            <dd>{fmt(secondsToRelease)}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Warning started</dt>
            <dd>{state?.warningStartedAt?.toISOString() ?? "—"}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

function fmt(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
