"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VerifyForm({
  token,
  defaultChannel,
  hasEmail,
  hasSms,
}: {
  token: string;
  defaultChannel: "EMAIL" | "SMS";
  hasEmail: boolean;
  hasSms: boolean;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<"EMAIL" | "SMS">(defaultChannel);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/r/${token}/send-code`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "failed to send");
        return;
      }
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/r/${token}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "verify failed");
        return;
      }
      router.push(`/r/${token}/message`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!sent && (
        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-sm text-neutral-400">Send code via</span>
            <div className="flex gap-2">
              {hasEmail && (
                <button
                  type="button"
                  onClick={() => setChannel("EMAIL")}
                  className={`rounded px-3 py-1.5 text-sm ${
                    channel === "EMAIL" ? "bg-indigo-600" : "bg-neutral-800"
                  }`}
                >
                  Email
                </button>
              )}
              {hasSms && (
                <button
                  type="button"
                  onClick={() => setChannel("SMS")}
                  className={`rounded px-3 py-1.5 text-sm ${
                    channel === "SMS" ? "bg-indigo-600" : "bg-neutral-800"
                  }`}
                >
                  SMS
                </button>
              )}
            </div>
          </div>
          <button
            onClick={send}
            disabled={busy}
            className="w-full rounded bg-indigo-600 py-2 font-medium disabled:opacity-50"
          >
            {busy ? "…" : "Send code"}
          </button>
        </div>
      )}

      {sent && (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-neutral-400">Enter the 6-digit code.</p>
          <input
            inputMode="numeric"
            pattern="\d{6}"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded bg-neutral-900 px-3 py-2 tracking-widest"
            autoFocus
          />
          <button
            disabled={busy}
            className="w-full rounded bg-indigo-600 py-2 font-medium disabled:opacity-50"
          >
            {busy ? "…" : "Verify"}
          </button>
        </form>
      )}

      {err && <p className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
