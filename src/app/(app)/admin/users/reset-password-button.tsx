"use client";
import { useState } from "react";

export function ResetPasswordButton({ userId, userName }: { userId: string; userName: string }) {
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function reset() {
    if (!confirm(`Сбросить пароль для «${userName}»? Старый перестанет работать сразу.`)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j?.error?.message ?? "Не удалось сбросить");
        return;
      }
      setTemp(j.tempPassword);
    } finally {
      setBusy(false);
    }
  }

  if (temp) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-700">
        новый: <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">{temp}</code>
        <span className="text-slate-400">(запишите — показан один раз)</span>
      </span>
    );
  }

  return (
    <span>
      <button
        onClick={reset}
        disabled={busy}
        className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 px-3 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        title="Выдать новый временный пароль"
      >
        {busy ? "..." : "Сбросить пароль"}
      </button>
      {err && <span className="ml-2 text-[11px] text-red-600">{err}</span>}
    </span>
  );
}
