"use client";

import { useEffect, useState } from "react";
import { PackagingPicker, type PackagingPickerOption } from "@/components/common/packaging-picker";
import { PACKAGING_TYPE_LABELS } from "@/lib/constants";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { PackagingType } from "@prisma/client";

type Link = {
  id: string;
  packagingItemId: string;
  quantityPerUnit: string | number;
  packagingItem: { id: string; name: string; type: PackagingType; photoUrl: string | null };
};

export function ModelPackagingKit({
  modelId,
  allPackagings,
}: {
  modelId: string;
  allPackagings: PackagingPickerOption[];
}) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newPick, setNewPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/models/${modelId}/packaging`, { credentials: "include" });
        const j = await res.json();
        if (!cancelled) setLinks(j.items ?? []);
      } catch {
        if (!cancelled) setLinks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [modelId]);

  async function addLink(packagingItemId: string) {
    if (!packagingItemId) return;
    setError(null);
    setBusyId("new");
    try {
      const res = await fetch(`/api/models/${modelId}/packaging`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ packagingItemId, quantityPerUnit: 1 }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось добавить");
        return;
      }
      const link = await res.json();
      setLinks((prev) => (prev ?? []).concat(link));
      setNewPick("");
    } finally {
      setBusyId(null);
    }
  }

  async function syncToOrders() {
    setSyncing(true);
    setSyncMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/models/${modelId}/packaging/sync`, {
        method: "POST",
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j?.error?.message ?? "Не удалось пересинхронизировать");
        return;
      }
      setSyncMsg(
        j.propagated > 0
          ? `Добавлено в ${j.propagated} строк заказов (${j.orders} открытых заказов)`
          : `Уже всё на месте (${j.orders ?? 0} открытых заказов)`,
      );
    } finally {
      setSyncing(false);
    }
  }

  async function removeLink(linkId: string) {
    setBusyId(linkId);
    try {
      await fetch(`/api/models/${modelId}/packaging/${linkId}`, {
        method: "DELETE",
        credentials: "include",
      });
      setLinks((prev) => (prev ?? []).filter((l) => l.id !== linkId));
    } finally {
      setBusyId(null);
    }
  }

  const usedIds = new Set((links ?? []).map((l) => l.packagingItemId));
  const availableOptions = allPackagings.filter((p) => !usedIds.has(p.id));

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Комплект упаковки
      </legend>
      <p className="text-xs text-slate-500">
        Применяется по умолчанию при создании заказа на любой цвет этого фасона.
      </p>

      {links === null ? (
        <div className="text-sm text-slate-400">Загрузка…</div>
      ) : links.length === 0 ? (
        <p className="text-xs text-slate-500">Пока не выбрано.</p>
      ) : (
        <div className="space-y-2">
          {links.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
            >
              {l.packagingItem.photoUrl ? (
                <PhotoThumb url={l.packagingItem.photoUrl} size={32} />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-200 text-[10px] text-slate-500">
                  нет фото
                </div>
              )}
              <div className="flex-1 text-sm">
                <div className="text-slate-900">{l.packagingItem.name}</div>
                <div className="text-xs text-slate-500">
                  {PACKAGING_TYPE_LABELS[l.packagingItem.type]}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeLink(l.id)}
                disabled={busyId === l.id}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Убрать
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <PackagingPicker
            value={newPick}
            options={availableOptions}
            onChange={(id) => { setNewPick(id); addLink(id); }}
            placeholder="+ добавить упаковку"
          />
        </div>
      </div>

      {/* Кнопка ручного пересинка — лечит исторические заказы, в которые
          упаковка не «протекла» автоматически (баг был до фикса каскада). */}
      {(links?.length ?? 0) > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <div className="text-xs text-slate-500">
            Нажми, если упаковка не подтянулась в существующие заказы этого фасона:
          </div>
          <button
            type="button"
            onClick={syncToOrders}
            disabled={syncing}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {syncing ? "Синхронизация…" : "Пересинхронизировать с заказами"}
          </button>
        </div>
      )}

      {syncMsg && <div className="text-xs text-emerald-700">{syncMsg}</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}
    </fieldset>
  );
}
