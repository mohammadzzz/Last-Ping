"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Row {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  telegramChatId: string | null;
  whatsappNumber: string | null;
  preferredOtpChannel: "EMAIL" | "SMS";
  assignmentCount: number;
}

export function RecipientsClient({ csrf, initial }: { csrf: string; initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    phone: "",
    telegramChatId: "",
    whatsappNumber: "",
    preferredOtpChannel: "EMAIL" as "EMAIL" | "SMS",
  });
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/recipients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        csrf,
        displayName: form.displayName,
        email: form.email || null,
        phone: form.phone || null,
        telegramChatId: form.telegramChatId || null,
        whatsappNumber: form.whatsappNumber || null,
        preferredOtpChannel: form.preferredOtpChannel,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error ?? "create failed");
      return;
    }
    const { recipient } = await res.json();
    setRows((prev) => [
      ...prev,
      {
        id: recipient.id,
        displayName: recipient.displayName,
        email: recipient.email,
        phone: recipient.phone,
        telegramChatId: recipient.telegramChatId,
        whatsappNumber: recipient.whatsappNumber,
        preferredOtpChannel: recipient.preferredOtpChannel,
        assignmentCount: 0,
      },
    ]);
    setForm({
      displayName: "",
      email: "",
      phone: "",
      telegramChatId: "",
      whatsappNumber: "",
      preferredOtpChannel: "EMAIL",
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this recipient?")) return;
    const res = await fetch(`/api/recipients/${id}`, {
      method: "DELETE",
      headers: { "x-csrf-token": csrf },
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "delete failed");
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <>
      <form onSubmit={create} className="space-y-2 rounded border border-neutral-800 p-4">
        <h2 className="text-sm font-medium text-neutral-300">New recipient</h2>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Display name" value={form.displayName} set={(v) => setForm({ ...form, displayName: v })} required />
          <Field label="Email" value={form.email} set={(v) => setForm({ ...form, email: v })} type="email" />
          <Field label="Phone (E.164)" value={form.phone} set={(v) => setForm({ ...form, phone: v })} />
          <Field label="Telegram chat id" value={form.telegramChatId} set={(v) => setForm({ ...form, telegramChatId: v })} />
          <Field label="WhatsApp (E.164)" value={form.whatsappNumber} set={(v) => setForm({ ...form, whatsappNumber: v })} />
          <label className="block">
            <span className="text-xs text-neutral-400">Preferred OTP</span>
            <select
              className="mt-1 w-full rounded bg-neutral-900 px-2 py-1.5"
              value={form.preferredOtpChannel}
              onChange={(e) =>
                setForm({ ...form, preferredOtpChannel: e.target.value as "EMAIL" | "SMS" })
              }
            >
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
            </select>
          </label>
        </div>
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button className="rounded bg-indigo-600 px-3 py-1.5 text-sm">Add</button>
      </form>

      <table className="w-full text-sm">
        <thead className="text-left text-neutral-400">
          <tr>
            <th className="py-2">Name</th>
            <th>Contact</th>
            <th>OTP</th>
            <th>Files</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-neutral-800">
              <td className="py-2">
                <Link href={`/recipients/${r.id}`} className="text-indigo-300 hover:underline">
                  {r.displayName}
                </Link>
              </td>
              <td className="text-neutral-400">{r.email ?? r.phone ?? "—"}</td>
              <td>{r.preferredOtpChannel}</td>
              <td>{r.assignmentCount}</td>
              <td className="text-right">
                <button onClick={() => remove(r.id)} className="text-red-400">Delete</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-neutral-500">
                No recipients yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function Field({
  label,
  value,
  set,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-400">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => set(e.target.value)}
        className="mt-1 w-full rounded bg-neutral-900 px-2 py-1.5"
      />
    </label>
  );
}
