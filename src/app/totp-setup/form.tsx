"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TotpVerifyForm({ csrf }: { csrf: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, csrf }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "verify failed");
        return;
      }
      router.push("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className="w-full rounded bg-neutral-900 px-3 py-2 tracking-widest"
        inputMode="numeric"
        pattern="\d{6}"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456"
        autoFocus
      />
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        disabled={busy}
        className="w-full rounded bg-indigo-600 py-2 font-medium disabled:opacity-50"
      >
        {busy ? "…" : "Confirm"}
      </button>
    </form>
  );
}
