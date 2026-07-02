"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/constants";

// Роли, доступные при создании (OWNER/DIRECTOR назначает только владелец — через таблицу)
const CREATABLE_ROLES = (Object.keys(ROLE_LABELS) as Role[]).filter(
  (r) => r !== "OWNER" && r !== "DIRECTOR",
);

export function AddUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("ASSISTANT");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ login: string; password: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j?.error?.message ?? "Не удалось создать");
        return;
      }
      setCreated({ login: j.email, password: j.startPassword });
      setName(""); setEmail(""); setRole("ASSISTANT");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
        <div className="font-medium text-slate-900">Сотрудник создан. Передайте доступ:</div>
        <div className="mt-1">
          логин <code className="rounded bg-white px-1 py-0.5 font-mono">{created.login}</code>{" "}
          · пароль <code className="rounded bg-white px-1 py-0.5 font-mono">{created.password}</code>
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          Пароль показан один раз — запишите. Сотрудник сможет сменить его сам в «Профиле».
        </div>
        <button
          onClick={() => { setCreated(null); setOpen(false); }}
          className="mt-2 inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50"
        >
          Записала, закрыть
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 active:bg-slate-800 sm:w-auto"
      >
        + Добавить сотрудника
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-end">
      <label className="flex flex-col text-xs text-slate-500">
        Имя
        <input
          value={name} onChange={(e) => setName(e.target.value)} required
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm sm:h-auto sm:w-40 sm:py-1.5"
          placeholder="Дарья"
        />
      </label>
      <label className="flex flex-col text-xs text-slate-500">
        Логин
        <input
          value={email} onChange={(e) => setEmail(e.target.value)} required
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm sm:h-auto sm:w-40 sm:py-1.5"
          placeholder="darya"
        />
      </label>
      <label className="flex flex-col text-xs text-slate-500">
        Роль
        <select
          value={role} onChange={(e) => setRole(e.target.value as Role)}
          className="h-11 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm sm:h-auto sm:w-auto sm:py-1.5"
        >
          {CREATABLE_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </label>
      <button
        type="submit" disabled={busy}
        className="flex h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 sm:h-9"
      >
        {busy ? "..." : "Создать"}
      </button>
      <button
        type="button" onClick={() => { setOpen(false); setErr(null); }}
        className="flex h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm text-slate-600 hover:bg-slate-50 sm:h-9"
      >
        Отмена
      </button>
      {err && <div className="w-full text-xs text-red-600">{err}</div>}
      <div className="w-full text-[11px] text-slate-400">
        Пароль сгенерируется автоматически и покажется один раз после создания.
      </div>
    </form>
  );
}
