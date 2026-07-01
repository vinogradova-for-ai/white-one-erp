"use client";
import { useState } from "react";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setDone(false);
    if (next !== repeat) {
      setErr("Новый пароль и повтор не совпадают");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error?.message ?? "Не удалось сменить пароль");
        return;
      }
      setCurrent(""); setNext(""); setRepeat("");
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  const input =
    "rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-full";

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-xs text-slate-500">
        Текущий пароль
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required className={input} autoComplete="current-password" />
      </label>
      <label className="block text-xs text-slate-500">
        Новый пароль (минимум 8 символов)
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} className={input} autoComplete="new-password" />
      </label>
      <label className="block text-xs text-slate-500">
        Новый пароль ещё раз
        <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={8} className={input} autoComplete="new-password" />
      </label>
      <button
        type="submit" disabled={busy}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {busy ? "..." : "Сменить пароль"}
      </button>
      {err && <div className="text-xs text-red-600">{err}</div>}
      {done && <div className="text-xs text-emerald-600">✓ Пароль сменён. При следующем входе — уже новый.</div>}
    </form>
  );
}
