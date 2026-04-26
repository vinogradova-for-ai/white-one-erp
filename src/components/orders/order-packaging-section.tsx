"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PACKAGING_TYPE_LABELS } from "@/lib/constants";
import { PackagingType } from "@prisma/client";

type Item = {
  id: string;
  packagingItemId: string;
  quantityPerUnit: number;
  notes: string | null;
  packagingItem: {
    id: string;
    name: string;
    type: PackagingType;
    stock: number;
    inProductionQty: number;
  };
};

type Option = {
  id: string;
  name: string;
  type: PackagingType;
  stock: number;
  inProductionQty: number;
};

export function OrderPackagingSection({
  orderId,
  orderQuantity,
  initialItems,
  availablePackaging,
}: {
  orderId: string;
  orderQuantity: number;
  initialItems: Item[];
  availablePackaging: Option[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ packagingItemId: "", quantityPerUnit: "1" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usedIds = new Set(items.map((i) => i.packagingItemId));
  const options = availablePackaging.filter((p) => !usedIds.has(p.id));

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.packagingItemId) {
      setError("Выберите упаковку");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/packaging`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packagingItemId: form.packagingItemId,
          quantityPerUnit: Number(form.quantityPerUnit) || 1,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error?.message ?? "Не удалось добавить");
        return;
      }
      const newItem = (await res.json()) as Item;
      setItems((it) => [...it, newItem]);
      setAdding(false);
      setForm({ packagingItemId: "", quantityPerUnit: "1" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(linkId: string) {
    if (!confirm("Убрать эту упаковку из заказа?")) return;
    const res = await fetch(`/api/orders/${orderId}/packaging/${linkId}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Не удалось удалить");
      return;
    }
    setItems((it) => it.filter((x) => x.id !== linkId));
    router.refresh();
  }

  // Локальное обновление количества — мгновенный пересчёт «Хватает/Не хватает».
  function setLocalQuantity(linkId: string, value: string) {
    const qty = Number(value.replace(",", "."));
    if (!Number.isFinite(qty)) return;
    setItems((it) => it.map((x) => (x.id === linkId ? { ...x, quantityPerUnit: qty } : x)));
  }

  async function commitQuantity(linkId: string, value: string) {
    const qty = Number(value.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) return;
    const res = await fetch(`/api/orders/${orderId}/packaging/${linkId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantityPerUnit: qty }),
    });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-2 py-1 text-left font-semibold">Упаковка</th>
                <th className="px-2 py-1 text-right font-semibold">На единицу</th>
                <th className="px-2 py-1 text-right font-semibold">Нужно всего</th>
                <th className="px-2 py-1 text-left font-semibold">Статус</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((x) => {
                const total = Math.ceil(orderQuantity * Number(x.quantityPerUnit));
                const have = x.packagingItem.stock + x.packagingItem.inProductionQty;
                const shortage = total - have;
                return (
                  <tr key={x.id}>
                    <td className="px-2 py-2">
                      <Link
                        href={`/packaging/${x.packagingItem.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {x.packagingItem.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {PACKAGING_TYPE_LABELS[x.packagingItem.type]}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={String(x.quantityPerUnit)}
                        onChange={(e) => setLocalQuantity(x.id, e.target.value)}
                        onBlur={(e) => commitQuantity(x.id, e.target.value)}
                        className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-right text-xs"
                      />
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">{total.toLocaleString("ru-RU")}</td>
                    <td className="px-2 py-2">
                      {shortage > 0 ? (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          Не хватает {shortage}
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          Хватает
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => removeItem(x.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Убрать
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Упаковка ещё не привязана. Добавьте бирки, размерники, пакеты и т.п., чтобы считать потребность.
        </p>
      )}

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          + Добавить упаковку
        </button>
      )}

      {adding && (
        <form onSubmit={addItem} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row">
          <select
            value={form.packagingItemId}
            onChange={(e) => setForm({ ...form, packagingItemId: e.target.value })}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">— выбрать упаковку —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {PACKAGING_TYPE_LABELS[p.type]}: {p.name} (на складе: {p.stock})
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="decimal"
            value={form.quantityPerUnit}
            onChange={(e) => setForm({ ...form, quantityPerUnit: e.target.value.replace(",", ".") })}
            placeholder="шт/единицу"
            className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "…" : "Добавить"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            Отмена
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {options.length === 0 && !adding && availablePackaging.length === 0 && (
        <p className="text-xs text-slate-400">
          Справочник упаковки пуст.{" "}
          <Link href="/packaging/new" className="underline">
            Создайте первую карточку
          </Link>
          .
        </p>
      )}
    </div>
  );
}
