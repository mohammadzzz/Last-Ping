"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Recipient {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  telegramChatId: string | null;
  whatsappNumber: string | null;
  preferredOtpChannel: "EMAIL" | "SMS";
  personalMessage: string;
}

interface FileRow {
  id: string;
  originalName: string;
  sizeBytes: number;
  assigned: boolean;
}

export function RecipientDetailClient({
  csrf,
  recipient,
  files,
}: {
  csrf: string;
  recipient: Recipient;
  files: FileRow[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState(recipient.personalMessage);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [rows, setRows] = useState(files);

  async function saveMessage() {
    setSaveMsg(null);
    const res = await fetch(`/api/recipients/${recipient.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csrf, personalMessage: msg }),
    });
    setSaveMsg(res.ok ? "Saved" : "Save failed");
    router.refresh();
  }

  async function toggle(fileId: string, nextAssigned: boolean) {
    if (nextAssigned) {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrf, recipientId: recipient.id, fileId }),
      });
      if (!res.ok) return alert("assign failed");
    } else {
      const res = await fetch(`/api/assignments/${recipient.id}/${fileId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrf },
      });
      if (!res.ok) return alert("unassign failed");
    }
    setRows((prev) => prev.map((r) => (r.id === fileId ? { ...r, assigned: nextAssigned } : r)));
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-300">Personal message</h2>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={8}
          className="w-full rounded bg-neutral-900 p-3 font-mono text-sm"
          placeholder="Shown only after the recipient verifies their one-time code."
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={saveMessage}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm"
          >
            Save message
          </button>
          {saveMsg && <span className="text-sm text-neutral-400">{saveMsg}</span>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-300">Files</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500">No files uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded border border-neutral-800">
            {rows.map((f) => (
              <li key={f.id} className="flex items-center justify-between px-3 py-2">
                <div>
                  <p>{f.originalName}</p>
                  <p className="text-xs text-neutral-500">{fmtBytes(f.sizeBytes)}</p>
                </div>
                <label className="text-sm">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={f.assigned}
                    onChange={(e) => toggle(f.id, e.target.checked)}
                  />
                  Include
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
