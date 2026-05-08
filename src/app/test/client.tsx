"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TestModeClient({ csrf, testMode }: { csrf: string; testMode: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(testMode);
  const [totp, setTotp] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setMsg(null);
    const res = await fetch("/api/test-mode/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csrf, totp, enable: next }),
    });
    const d = await res.json();
    if (!res.ok) {
      setMsg(d.error ?? "failed");
      return;
    }
    setEnabled(d.testMode);
    setTotp("");
    setMsg(`Test mode ${d.testMode ? "on" : "off"}`);
    router.refresh();
  }

  async function simulate(path: "simulate-warning" | "simulate-release") {
    setMsg(null);
    const res = await fetch(`/api/test-mode/${path}`, {
      method: "POST",
      headers: { "x-csrf-token": csrf },
    });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok ? `${path} dispatched` : d.error ?? "failed");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded border border-neutral-800 p-4">
        <div>
          <p className="font-medium">Test mode</p>
          <p className="text-sm text-neutral-400">
            Currently: {enabled ? "ON" : "OFF"}
          </p>
        </div>
        <input
          placeholder="TOTP"
          inputMode="numeric"
          pattern="\d{6}"
          value={totp}
          onChange={(e) => setTotp(e.target.value)}
          className="ml-auto w-24 rounded bg-neutral-900 px-2 py-1 tracking-widest"
        />
        <button
          onClick={() => toggle(!enabled)}
          className="rounded bg-amber-600 px-3 py-1.5 text-sm"
        >
          {enabled ? "Disable" : "Enable"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          disabled={!enabled}
          onClick={() => simulate("simulate-warning")}
          className="rounded border border-neutral-800 p-4 text-left disabled:opacity-40"
        >
          <p className="font-medium">Simulate warning</p>
          <p className="text-sm text-neutral-400">Send a warning to your contacts now.</p>
        </button>
        <button
          disabled={!enabled}
          onClick={() => simulate("simulate-release")}
          className="rounded border border-neutral-800 p-4 text-left disabled:opacity-40"
        >
          <p className="font-medium">Simulate release</p>
          <p className="text-sm text-neutral-400">
            Create a test release with sample files; owner-only notifications.
          </p>
        </button>
      </div>

      {msg && <p className="text-sm text-neutral-300">{msg}</p>}
    </div>
  );
}
