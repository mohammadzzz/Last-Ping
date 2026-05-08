"use client";

import { useState } from "react";

export function CheckinLinkForm({ token }: { token: string }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/checkin/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "failed");
        return;
      }
      setOk(true);
    } finally {
      setBusy(false);
    }
  }

  if (ok) {
    return (
      <div className="rounded border border-emerald-700 bg-emerald-950 p-4 text-emerald-200">
        You&apos;re checked in. Nothing will be sent.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-sm text-neutral-400">PIN</span>
        <input
          className="mt-1 w-full rounded bg-neutral-900 px-3 py-2 tracking-widest"
          type="password"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          autoFocus
        />
      </label>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        disabled={busy}
        className="w-full rounded bg-emerald-600 py-2 font-medium disabled:opacity-50"
      >
        {busy ? "…" : "Check in"}
      </button>
    </form>
  );
}
