"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/constants";
import type { OrderStatus } from "@prisma/client";
import { VariantVisual } from "@/components/common/variant-visual";
import { ClickableRow } from "@/components/common/clickable-row";
import { ColorChip } from "@/components/common/color-chip";

// Плоская строка «Заказов в пути» — сериализуется на сервере (даты уже отформатированы).
export type IncomingOrderItem = {
  id: string;
  orderNumber: string;
  modelName: string;
  variantPhotoUrl: string | null;
  modelPhotoUrl: string | null;
  firstColorName: string | null;
  colorNames: string[];
  totalQty: number;
  hasFact: boolean;
  factoryName: string | null;
  factoryCountry: string | null;
  deliveryMethodLabel: string | null;
  status: OrderStatus;
  arrivalPlanned: string; // уже отформатированная дата (или «—»)
  arrivalActual: string;
};

// Мобильные карточки + десктопная таблица. selectable=true добавляет чекбоксы
// и sticky-кнопку «Собрать поставку из выбранных» (§4 UX-аудита /shipments).
export function IncomingOrdersList({
  orders,
  emptyText,
  selectable,
}: {
  orders: IncomingOrderItem[];
  emptyText: string;
  selectable: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allIds = orders.map((o) => o.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  async function buildShipment() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/shipments/from-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error?.message ?? "Не удалось собрать поставку");
        return;
      }
      if (Array.isArray(data.skipped) && data.skipped.length > 0) {
        alert(
          `Поставка ${data.number} создана. Не вошли (все партии уже в поставках): ` +
            data.skipped.map((s: { orderNumber: string }) => s.orderNumber).join(", "),
        );
      }
      router.push(`/shipments/${data.shipmentId}`);
    } finally {
      setBusy(false);
    }
  }

  const checkboxCls = "h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500";

  return (
    <>
      {/* Мобильная версия */}
      <div className="space-y-2 md:hidden">
        {selectable && orders.length > 0 && (
          <label className="flex min-h-[44px] cursor-pointer select-none items-center gap-2 px-1 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className={checkboxCls} />
            Выбрать все
          </label>
        )}
        {orders.map((o) => (
          <div
            key={o.id}
            className={`rounded-xl border bg-white dark:bg-slate-900 ${
              selected.has(o.id) ? "border-blue-400 ring-2 ring-blue-500/30" : "border-slate-200 dark:border-slate-700"
            }`}
          >
            <div className="flex items-stretch">
              {selectable && (
                <label className="flex w-11 shrink-0 cursor-pointer items-center justify-center" aria-label={`Выбрать ${o.orderNumber}`}>
                  <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className={checkboxCls} />
                </label>
              )}
              <Link href={`/orders/${o.id}`} className={`block flex-1 p-3 active:bg-slate-50 ${selectable ? "pl-0" : ""}`}>
                <div className="flex items-center gap-3">
                  <VariantVisual
                    variantPhotoUrl={o.variantPhotoUrl}
                    modelPhotoUrl={o.modelPhotoUrl}
                    colorName={o.firstColorName}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-900">{o.modelName}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-mono text-[11px]">{o.orderNumber}</span>
                      {o.colorNames.slice(0, 4).map((c, i) => <ColorChip key={i} name={c} size={10} />)}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] ${ORDER_STATUS_COLORS[o.status]}`}>
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-slate-400">Кол-во · {o.hasFact ? <span className="font-semibold text-emerald-700">факт</span> : <span>план</span>}</div>
                    <div className="font-semibold text-slate-900">{formatNumber(o.totalQty)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">План</div>
                    <div className="font-medium text-slate-900">{o.arrivalPlanned}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Факт</div>
                    <div className="font-medium text-slate-900">{o.arrivalActual}</div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        ))}
        {orders.length === 0 && emptyText && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            <div className="mb-2 text-3xl">▣</div>
            {emptyText}
          </div>
        )}
      </div>

      {/* Десктопная версия — таблица */}
      <div className="scroll-x-hint hidden md:block">
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_rgb(226_232_240)]">
              <tr>
                {selectable && (
                  <th className="w-10 px-3 py-2">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Выбрать все" className={checkboxCls} />
                  </th>
                )}
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фото</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">№</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Изделие</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Кол-во</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фабрика</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Способ</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Прибытие план</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Прибытие факт</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <ClickableRow key={o.id} href={`/orders/${o.id}`} className={selected.has(o.id) ? "bg-blue-50/60 dark:bg-blue-400/10" : "hover:bg-slate-50"}>
                  {selectable && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <label className="flex h-8 w-8 cursor-pointer items-center justify-center" aria-label={`Выбрать ${o.orderNumber}`}>
                        <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className={checkboxCls} />
                      </label>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <VariantVisual
                      variantPhotoUrl={o.variantPhotoUrl}
                      modelPhotoUrl={o.modelPhotoUrl}
                      colorName={o.firstColorName}
                      size={40}
                    />
                  </td>
                  <td className="px-3 py-2"><Link href={`/orders/${o.id}`} className="font-mono text-xs hover:underline">{o.orderNumber}</Link></td>
                  <td className="px-3 py-2">
                    <div className="text-slate-900">{o.modelName}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      {o.colorNames.length > 0 ? o.colorNames.map((c, i) => <ColorChip key={i} name={c} size={10} />) : "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatNumber(o.totalQty)}
                    {o.hasFact ? (
                      <span className="ml-1 text-[10px] font-semibold uppercase text-emerald-700" title="Фактическое количество после ОТК">факт</span>
                    ) : (
                      <span className="ml-1 text-[10px] uppercase text-slate-400" title="План — факт ещё не проставлен">план</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {o.factoryName ?? "—"}
                    {o.factoryCountry && <div className="text-slate-400">{o.factoryCountry}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs">{o.deliveryMethodLabel ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status]}`}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{o.arrivalPlanned}</td>
                  <td className="px-3 py-2 text-xs">{o.arrivalActual}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && emptyText && <div className="p-12 text-center text-sm text-slate-500">{emptyText}</div>}
        </div>
      </div>

      {/* Sticky-панель сборки поставки */}
      {selectable && selected.size > 0 && (
        <div className="sticky bottom-0 z-30 -mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="text-sm text-slate-700 dark:text-slate-200">
            Выбрано заказов: <span className="font-semibold">{selected.size}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setSelected(new Set())}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              Снять
            </button>
            <button
              onClick={buildShipment}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {busy ? "Собираю…" : `Собрать карго из выбранных (${selected.size})`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
