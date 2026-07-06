"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * «Снять с разработки / Вернуть в работу» (Алёна 05.07.2026).
 * Сценарий: фасон с историей заказов взяли в разработку и передумали —
 * удалить нельзя (история заказов блокирует, и правильно), а убрать с
 * канбана/из задач нужно. activated=false прячет фасон из рабочих экранов
 * (канбан, Гант, доска, чек-листы); сам фасон и его заказы остаются —
 * в «Фасонах» под фильтром черновиков/не в работе. Обратимо одной кнопкой.
 */
export function ModelWorkToggle({ modelId, activated }: { modelId: string; activated: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    if (
      activated &&
      !window.confirm(
        "Снять фасон с разработки? Он уйдёт с канбана, Ганта и из задач. Фасон и история его заказов останутся в «Фасонах» — вернуть в работу можно в любой момент.",
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/models/${modelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activated: !activated }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не получилось изменить статус работы");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {busy ? "…" : activated ? "⏸ Снять с разработки" : "▶ Вернуть в работу"}
    </button>
  );
}
