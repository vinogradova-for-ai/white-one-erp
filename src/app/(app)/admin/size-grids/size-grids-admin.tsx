"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type SizeGridRow = {
  id: string;
  name: string;
  sizes: string[];
  notes: string | null;
  usedByModels: number;
};

export function SizeGridsAdmin({ initial }: { initial: SizeGridRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", sizesRaw: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function startEdit(g: SizeGridRow) {
    setEditId(g.id);
    setDraft({ name: g.name, sizesRaw: g.sizes.join(", "), notes: g.notes ?? "" });
    setErr(null);
  }

  async function save(id: string) {
    setBusy(true);
    setErr(null);
    try {
      const sizes = draft.sizesRaw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
      if (sizes.length === 0) {
        setErr("Нужен хотя бы один размер");
        return;
      }
      const res = await fetch(`/api/size-grids/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, sizes, notes: draft.notes || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error?.message ?? "Не удалось сохранить");
        return;
      }
      setRows(rows.map((r) => (r.id === id ? { ...r, name: draft.name, sizes, notes: draft.notes || null } : r)));
      setEditId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить размерную сетку? Восстановить будет нельзя.")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/size-grids/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j?.error?.message ?? "Не удалось удалить");
        return;
      }
      setRows(rows.filter((r) => r.id !== id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Название</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Размеры</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Использований</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((g) => {
              const isEdit = editId === g.id;
              return (
                <tr key={g.id} className="align-top">
                  <td className="px-3 py-2 font-medium">
                    {isEdit ? (
                      <input
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                      />
                    ) : (
                      g.name
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {isEdit ? (
                      <input
                        value={draft.sizesRaw}
                        onChange={(e) => setDraft({ ...draft, sizesRaw: e.target.value })}
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm font-mono"
                        placeholder="42, 44, 46, 48"
                      />
                    ) : (
                      <span className="font-mono text-xs">{g.sizes.join(", ")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{g.usedByModels}</td>
                  <td className="px-3 py-2 text-right">
                    {isEdit ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => save(g.id)}
                          className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {busy ? "…" : "Сохранить"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditId(null)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(g)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          disabled={busy || g.usedByModels > 0}
                          title={g.usedByModels > 0 ? "Используется в фасонах" : ""}
                          onClick={() => remove(g.id)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-12 text-center text-sm text-slate-500">
                  Пока нет ни одной сетки. Создайте при создании фасона.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
