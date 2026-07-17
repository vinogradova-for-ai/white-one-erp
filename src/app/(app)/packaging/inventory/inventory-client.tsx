"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Массовая инвентаризация упаковки (Алёна 17.07): одна таблица на все
 * позиции — вводишь факт по Китаю/Москве, пустое поле не трогаем.
 * Каждый пересчёт — якорь: от него учёт строится заново.
 */

export type InventoryRow = {
  id: string;
  name: string;
  sku: string | null;
  photoUrl: string | null;
  cn: number;
  msk: number;
};

const cellInput =
  "h-10 w-24 rounded-lg border border-slate-300 px-2 text-right text-sm tabular-nums dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

export function InventoryClient({ rows }: { rows: InventoryRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, { cn: string; msk: string }>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (id: string, wh: "cn" | "msk", v: string) =>
    setValues((p) => ({ ...p, [id]: { cn: p[id]?.cn ?? "", msk: p[id]?.msk ?? "", [wh]: v } }));

  const filled = rows
    .map((r) => {
      const v = values[r.id];
      if (!v) return null;
      const cn = v.cn.trim() === "" ? null : Number(v.cn);
      const msk = v.msk.trim() === "" ? null : Number(v.msk);
      if (cn == null && msk == null) return null;
      return { packagingItemId: r.id, cn, msk };
    })
    .filter(Boolean) as Array<{ packagingItemId: string; cn: number | null; msk: number | null }>;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/packaging/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: filled, note: note || null }),
      });
      if (!res.ok) {
        alert((await res.json().catch(() => ({})))?.error?.message ?? "Не получилось сохранить");
        return;
      }
      router.push("/packaging");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl bg-white dark:bg-slate-900">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="px-4 py-3 font-medium">Позиция</th>
              <th className="px-4 py-3 text-right font-medium">🇨🇳 сейчас</th>
              <th className="px-4 py-3 text-right font-medium">🇨🇳 по факту</th>
              <th className="px-4 py-3 text-right font-medium">🇷🇺 сейчас</th>
              <th className="px-4 py-3 text-right font-medium">🇷🇺 по факту</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0 dark:border-slate-800">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2.5">
                    {r.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded bg-slate-100 dark:bg-slate-800" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{r.name}</span>
                      {r.sku && <span className="block font-mono text-[11px] text-slate-400">{r.sku}</span>}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.cn.toLocaleString("ru-RU")}</td>
                <td className="px-4 py-2 text-right">
                  <input
                    value={values[r.id]?.cn ?? ""}
                    onChange={(e) => set(r.id, "cn", e.target.value)}
                    placeholder="—"
                    inputMode="numeric"
                    className={cellInput}
                  />
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.msk.toLocaleString("ru-RU")}</td>
                <td className="px-4 py-2 text-right">
                  <input
                    value={values[r.id]?.msk ?? ""}
                    onChange={(e) => set(r.id, "msk", e.target.value)}
                    placeholder="—"
                    inputMode="numeric"
                    className={cellInput}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="комментарий («пересчёт склада Китая от Ли», необязательно)"
          className="h-11 w-80 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="button"
          disabled={busy || filled.length === 0}
          onClick={save}
          className="inline-flex h-11 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {busy ? "Сохраняю…" : `Сохранить инвентаризацию (${filled.length})`}
        </button>
        <Link href="/packaging" className="text-sm text-slate-500 underline">
          отмена
        </Link>
      </div>
      <p className="text-xs text-slate-400">
        Пустое поле — склад не пересчитывали, остаток не трогаем. Заполненное — остаток встанет ровно
        в это число и станет якорем: события задним числом его больше не сдвинут.
      </p>
    </div>
  );
}
