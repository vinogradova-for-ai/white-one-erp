"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserToggleButton({ userId, isActive }: { userId: string; isActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/toggle`, { method: "PATCH" });
      if (res.ok) router.refresh();
      else alert("Не удалось обновить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`inline-flex min-h-[36px] items-center rounded px-3 text-xs font-medium ${
        isActive
          ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          : "bg-slate-900 text-white hover:bg-slate-800"
      } disabled:opacity-50`}
    >
      {busy ? "…" : isActive ? "Отключить" : "Включить"}
    </button>
  );
}
