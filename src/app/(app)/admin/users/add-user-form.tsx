"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error?.message ?? "Не удалось создать");
        return;
      }
      setName(""); setEmail(""); setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
      >
        + Добавить сотрудника
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-xs text-slate-500">
        Имя
        <input
          value={name} onChange={(e) => setName(e.target.value)} required
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-40"
          placeholder="Дарья"
        />
      </label>
      <label className="flex flex-col text-xs text-slate-500">
        Email
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-56"
          placeholder="darya@whiteone.ru"
        />
      </label>
      <button
        type="submit" disabled={busy}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "..." : "Создать"}
      </button>
      <button
        type="button" onClick={() => { setOpen(false); setErr(null); }}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        Отмена
      </button>
      {err && <div className="w-full text-xs text-red-600">{err}</div>}
      <div className="w-full text-[11px] text-slate-400">
        Пароль по умолчанию: <code className="bg-slate-100 px-1 rounded">whiteone2026</code>. Сотрудник сможет сменить его сам.
      </div>
    </form>
  );
}
