"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface FileRow {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  assignmentCount: number;
  isSample: boolean;
}

export function FilesClient({ csrf, initialFiles }: { csrf: string; initialFiles: FileRow[] }) {
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function upload(f: File) {
    setErr(null);
    setUploading(true);
    setProgress(0);
    try {
      const url = `/api/files/upload?name=${encodeURIComponent(f.name)}&mime=${encodeURIComponent(
        f.type || "application/octet-stream",
      )}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-csrf-token": csrf,
          "content-type": "application/octet-stream",
        },
        body: f,
        // @ts-expect-error — standard not yet typed in TS lib
        duplex: "half",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "upload failed");
        return;
      }
      const meta = await res.json();
      setFiles((prev) => [
        {
          id: meta.id,
          originalName: meta.originalName,
          mimeType: meta.mimeType,
          sizeBytes: meta.sizeBytes,
          createdAt: new Date().toISOString(),
          assignmentCount: 0,
          isSample: false,
        },
        ...prev,
      ]);
      router.refresh();
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    const res = await fetch(`/api/files/${id}`, {
      method: "DELETE",
      headers: { "x-csrf-token": csrf },
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "delete failed");
      return;
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <>
      <div className="rounded border border-dashed border-neutral-700 p-6 text-center">
        <input
          type="file"
          className="block w-full text-sm"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        {uploading && (
          <p className="mt-2 text-sm text-neutral-400">
            Uploading… {progress > 0 ? `${progress}%` : ""}
          </p>
        )}
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-neutral-400">
          <tr>
            <th className="py-2">Name</th>
            <th>Size</th>
            <th>Assigned</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id} className="border-t border-neutral-800">
              <td className="py-2">
                {f.originalName}
                {f.isSample && (
                  <span className="ml-2 rounded bg-amber-800 px-1.5 py-0.5 text-xs">sample</span>
                )}
              </td>
              <td>{fmtBytes(f.sizeBytes)}</td>
              <td>{f.assignmentCount}</td>
              <td className="text-right">
                <button
                  onClick={() => remove(f.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {files.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-neutral-500">
                No files yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
