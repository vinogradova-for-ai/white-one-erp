"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Универсальная кнопка «Удалить» с двухступенчатым подтверждением
 * через confirm() — soft delete на бэке, переадресация на список.
 */
export function DeleteButton({
  apiPath,
  redirectTo,
  confirmText,
  label = "Удалить",
}: {
  apiPath: string;
  redirectTo: string;
  confirmText: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (busy) return;
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(apiPath, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось удалить");
        setBusy(false);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Не удалось удалить");
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "Удаление…" : label}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
