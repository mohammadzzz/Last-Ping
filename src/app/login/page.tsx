"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsTotp, setNeedsTotp] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, totp: totp || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "totp required") {
          setNeedsTotp(true);
        } else {
          setErr(data.error ?? "login failed");
        }
        return;
      }
      router.push(data.needsTotpSetup ? "/totp-setup" : "/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-6 text-2xl font-semibold">Last Ping</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-sm text-neutral-400">Email</span>
          <input
            className="mt-1 w-full rounded bg-neutral-900 px-3 py-2"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm text-neutral-400">Password</span>
          <input
            className="mt-1 w-full rounded bg-neutral-900 px-3 py-2"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {needsTotp && (
          <label className="block">
            <span className="text-sm text-neutral-400">TOTP code</span>
            <input
              className="mt-1 w-full rounded bg-neutral-900 px-3 py-2 tracking-widest"
              inputMode="numeric"
              pattern="\d{6}"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              autoFocus
            />
          </label>
        )}
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button
          disabled={busy}
          className="w-full rounded bg-indigo-600 py-2 font-medium disabled:opacity-50"
        >
          {busy ? "…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
