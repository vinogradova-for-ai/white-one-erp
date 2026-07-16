"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { PaymentRowActions } from "@/components/payments/payment-row-actions";

// Плоский DTO строки «Предстоящих» — сериализуется из серверного ListView.
export type PaymentListItem = {
  id: string;
  plannedDateIso: string; // ISO даты плана
  amount: string; // Decimal → строка
  label: string;
  type: "ORDER" | "PACKAGING";
  subject: string; // за что платим (имя фасона / упаковки)
  colorNames: string | null; // для заказа — «молочный, чёрный»
  counterparty: string | null; // фабрика / поставщик
  orderNumber: string | null; // ORD-… / PKG-…
  href: string; // куда ведёт карточка
};

const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function PaymentsBulkList({
  items,
  group,
  canMarkPaid,
  todayIso,
}: {
  items: PaymentListItem[];
  group: "date" | "factory";
  canMarkPaid: boolean;
  todayIso: string; // YYYY-MM-DD по Москве — сравнение просрочки без TZ-сюрпризов
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function setMany(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }
  function clearSel() {
    setSelected(new Set());
  }

  const allIds = items.map((i) => i.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const selectedSum = items.filter((i) => selected.has(i.id)).reduce((a, i) => a + Number(i.amount), 0);

  async function markSelectedPaid() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/payments/mark-paid-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error?.message ?? "Не удалось отметить оплаченными");
      } else {
        clearSel();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const groups =
    group === "factory"
      ? buildFactoryGroups(items)
      : [{ key: "__all__", name: "", items, sum: 0 }];

  return (
    <>
      {/* Тулбар «Выбрать все» — только тем, кто вправе отмечать оплату */}
      {canMarkPaid && items.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-1">
          <label className="inline-flex min-h-[44px] cursor-pointer select-none items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => setMany(allIds, e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
            />
            Выбрать все
          </label>
          {selected.size > 0 && (
            <span className="text-xs text-slate-400">выбрано {selected.size} из {items.length}</span>
          )}
        </div>
      )}

      <div className="space-y-5">
        {groups.map((g) => {
          const groupIds = g.items.map((i) => i.id);
          const groupAllSelected = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
          return (
            <section key={g.key}>
              {group === "factory" && (
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                  {canMarkPaid && (
                    <input
                      type="checkbox"
                      aria-label={`Выбрать все платежи: ${g.name}`}
                      checked={groupAllSelected}
                      onChange={(e) => setMany(groupIds, e.target.checked)}
                      className="h-5 w-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
                    />
                  )}
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{g.name}</h3>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(g.sum)}</span>
                  <span className="text-xs text-slate-500">{g.items.length} шт</span>
                </div>
              )}
              <div className="space-y-2">
                {g.items.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    checked={selected.has(item.id)}
                    onToggle={() => setMany([item.id], !selected.has(item.id))}
                    canMarkPaid={canMarkPaid}
                    todayIso={todayIso}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Sticky-панель массового действия — появляется при выборе */}
      {canMarkPaid && selected.size > 0 && (
        <div className="sticky bottom-0 z-30 -mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="text-sm text-slate-700 dark:text-slate-200">
            Выбрано <span className="font-semibold">{selected.size}</span> · {formatCurrency(selectedSum)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={clearSel}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              Снять
            </button>
            <button
              onClick={markSelectedPaid}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Отмечаю…" : `Отметить оплаченными (${selected.size})`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  item,
  checked,
  onToggle,
  canMarkPaid,
  todayIso,
}: {
  item: PaymentListItem;
  checked: boolean;
  onToggle: () => void;
  canMarkPaid: boolean;
  todayIso: string;
}) {
  const isOverdue = item.plannedDateIso.slice(0, 10) < todayIso; // все строки — PENDING
  const d = new Date(item.plannedDateIso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = MONTH_SHORT[d.getUTCMonth()];
  const year = d.getUTCFullYear();

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 dark:bg-slate-900 ${
        checked
          ? "border-green-400 ring-2 ring-green-500/30 dark:border-green-400/40"
          : isOverdue
          ? "border-red-300 bg-red-50/40 dark:border-red-400/20 dark:bg-red-400/10"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      {canMarkPaid && (
        <label className="flex h-11 w-8 shrink-0 cursor-pointer items-center justify-center" aria-label="Выбрать платёж">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="h-5 w-5 rounded border-slate-300 text-green-600 focus:ring-green-500"
          />
        </label>
      )}

      {/* Дата */}
      <div className="min-w-[76px] text-left">
        <div className={`text-3xl font-bold leading-none ${isOverdue ? "text-red-700 dark:text-red-300" : "text-slate-900 dark:text-slate-100"}`}>
          {day}
        </div>
        <div className={`text-xs uppercase ${isOverdue ? "text-red-600 dark:text-red-300" : "text-slate-500"}`}>
          {mon} {year}
        </div>
        {isOverdue && <div className="text-[10px] font-semibold text-red-600 dark:text-red-300">просрочен</div>}
      </div>

      {/* Сумма */}
      <div className="min-w-[130px] text-left">
        <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(item.amount)}</div>
        <div className="text-xs text-slate-500">{item.label}</div>
      </div>

      {/* За что плачу */}
      <div className="min-w-[200px] flex-1">
        <Link href={item.href} className="block text-base font-semibold text-slate-900 hover:underline dark:text-slate-100">
          {item.subject}
          {item.colorNames && <span className="ml-1 text-sm font-normal text-slate-500">· {item.colorNames}</span>}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              item.type === "ORDER"
                ? "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300"
                : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
            }`}
          >
            {item.type === "ORDER" ? "Фабрика" : "Упаковка"}
          </span>
          {item.counterparty && <span>{item.counterparty}</span>}
          {item.orderNumber && <span className="font-mono text-[10px]">{item.orderNumber}</span>}
        </div>
      </div>

      {/* Действия (одиночные — как было) */}
      <div className="ml-auto">
        <PaymentRowActions id={item.id} status="PENDING" />
      </div>
    </div>
  );
}

function buildFactoryGroups(items: PaymentListItem[]) {
  const map = new Map<string, { key: string; name: string; items: PaymentListItem[] }>();
  for (const p of items) {
    const name =
      p.counterparty ?? (p.type === "ORDER" ? "Фабрика не указана" : "Упаковка · поставщик не указан");
    const g = map.get(name) ?? { key: name, name, items: [] };
    g.items.push(p);
    map.set(name, g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, sum: g.items.reduce((a, i) => a + Number(i.amount), 0) }))
    .sort((a, b) => b.sum - a.sum);
}
