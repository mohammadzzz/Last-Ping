"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CheckinButton({ csrf }: { csrf: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function click() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
      });
      if (!res.ok) {
        setMsg("Check-in failed");
        return;
      }
      setMsg("You're checked in. Nothing will be sent.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={click}
        disabled={busy}
        className="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-50"
      >
        {busy ? "…" : "I'm alive"}
      </button>
      {msg && <p className="mt-2 text-sm text-emerald-300">{msg}</p>}
    </div>
  );
}
