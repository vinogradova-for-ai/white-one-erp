"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_TYPE_LABELS, ORDER_STATUS_ORDER } from "@/lib/constants";
import { VariantVisual } from "@/components/common/variant-visual";
import { ColorChip } from "@/components/common/color-chip";
import { ClickableRow } from "@/components/common/clickable-row";
import { FilterDropdown } from "@/components/common/filter-dropdown";
import { usePersistedState } from "@/lib/use-persisted-state";
import { OrderStatus, OrderType } from "@prisma/client";

export type OrdersListRow = {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  status: OrderStatus;
  isDelayed: boolean;
  hasIssue: boolean;
  arrivalPlannedDate: string | null;
  /** Опаздывает N дней: план прибытия прошёл, факта нет. 0 если не опаздывает.
   *  Подсветка без смены статуса — заказ ещё едет, а не «на складе» (аудит п.6). */
  lateDays: number;
  /** Себестоимость заказа в рублях. Считается на серверной странице из снапшотов
   *  по линиям + fallback на fullCost фасона. 0 если данных нет. */
  totalAmount: number;
  productModel: { name: string; category: string; photoUrls: string[] };
  factory: { name: string } | null;
  owner: { id: string; name: string };
  lines: Array<{
    quantity: number;
    productVariant: { colorName: string; photoUrls: string[] };
  }>;
  /** Список названий упаковки, применяемой к заказу. Через запятую в карточке/таблице. */
  packagingNames: string[];
};

export type OrdersListFilterOptions = {
  categories: Array<{ value: string; label: string; count: number }>;
  owners: Array<{ value: string; label: string; count: number }>;
  statuses: Array<{ value: string; label: string; count: number }>;
};

export function OrdersListClient({
  orders,
  filterOptions,
}: {
  orders: OrdersListRow[];
  filterOptions: OrdersListFilterOptions;
}) {
  // Фильтры запоминаются между заходами (localStorage) — см. usePersistedState.
  const [filters, setFilters] = usePersistedState<{
    category: string[];
    ownerId: string[];
    status: string[];
  }>("orders:filters:v1", { category: [], ownerId: [], status: [] });
  // П4 UX-аудита: завершённое — за свёрткой. Дефолт «В работе» (до склада МСК),
  // прибывшие показываются только в режиме «Все».
  const [mode, setMode] = usePersistedState<"active" | "all">("orders:mode:v1", "active");
  // §4: быстрый чип «⚠ опаздывают» — показать только заказы с просроченным прибытием.
  const [lateOnly, setLateOnly] = useState(false);
  const [search, setSearch] = useState("");
  const warehouseIdx = ORDER_STATUS_ORDER.indexOf("WAREHOUSE_MSK");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = orders.filter((o) => {
      if (mode === "active" && ORDER_STATUS_ORDER.indexOf(o.status) >= warehouseIdx) return false;
      if (lateOnly && o.lateDays <= 0) return false;
      if (filters.category.length && !filters.category.includes(o.productModel.category)) return false;
      if (filters.ownerId.length && !filters.ownerId.includes(o.owner.id)) return false;
      if (filters.status.length && !filters.status.includes(o.status)) return false;
      if (query) {
        const hay = [
          o.orderNumber,
          o.productModel.name,
          o.productModel.category,
          o.factory?.name ?? "",
          o.owner.name,
          ...o.lines.map((l) => l.productVariant.colorName),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    if (mode !== "active") return base;
    // «В работе» — ближайшее прибытие сверху, без даты — в конец.
    return [...base].sort((a, b) => {
      if (!a.arrivalPlannedDate && !b.arrivalPlannedDate) return 0;
      if (!a.arrivalPlannedDate) return 1;
      if (!b.arrivalPlannedDate) return -1;
      return a.arrivalPlannedDate.localeCompare(b.arrivalPlannedDate);
    });
  }, [orders, filters, mode, lateOnly, search, warehouseIdx]);

  const arrivedCount = useMemo(
    () => orders.filter((o) => ORDER_STATUS_ORDER.indexOf(o.status) >= warehouseIdx).length,
    [orders, warehouseIdx],
  );

  return (
    <div className="space-y-4">
      {/* Мобайл: заголовок + действие в отдельной строке, фильтры лентой ниже.
          Тёмная тема: bg-slate-50/95 и md:bg-white не кроются глобальным dark-слоем
          (он матчит только базовые классы) — «не видно что наверху», скрин Алёны 05.07 */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur dark:bg-slate-900/95 md:static md:mx-0 md:rounded-xl md:border md:bg-white md:p-2 md:backdrop-blur-none dark:md:bg-slate-900">
        <div className="flex items-center justify-between gap-3 md:hidden">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold text-slate-900">Заказы</h1>
            <span className="text-xs text-slate-500">
              {filtered.length}/{orders.length}
            </span>
          </div>
          <Link
            href="/orders/new"
            className="flex h-10 shrink-0 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white active:bg-slate-800"
          >
            + Заказ
          </Link>
        </div>
        {/* Поиск на мобиле — отдельной строкой, чтобы был на виду (Алёна 22.07) */}
        <div className="relative mt-2 md:hidden">
          <input
            type="search"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: изделие, №, цвет, фабрика…"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-3 pr-9 text-sm text-slate-900 placeholder:text-slate-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Очистить поиск"
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-slate-400"
            >
              ✕
            </button>
          )}
        </div>
        {/* Фильтры: мобайл — лента, десктоп — в общей полосе с заголовком */}
        <div className="no-scrollbar mt-2 flex items-center gap-2 overflow-x-auto md:mt-0 md:flex-wrap">
          <div className="hidden items-baseline gap-2 md:flex">
            <h1 className="text-sm font-semibold text-slate-900">Заказы на производство</h1>
            <span className="text-xs text-slate-500">
              {filtered.length}/{orders.length}
            </span>
          </div>
          <Link
            href="/orders/new"
            className="hidden rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 md:inline-block"
          >
            + Заказ
          </Link>
          <span className="mx-1 hidden h-5 w-px bg-slate-200 md:inline-block" aria-hidden />
          {/* «В работе / Все» — завершённое спрятано по умолчанию (П4) */}
          <div className="flex shrink-0 gap-1 rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setMode("active")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                mode === "active" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              В работе
            </button>
            <button
              type="button"
              onClick={() => setMode("all")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                mode === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Все{arrivedCount > 0 ? ` (+${arrivedCount} прибыло)` : ""}
            </button>
          </div>
          {(() => {
            const lateCount = orders.filter(
              (o) => o.lateDays > 0 && (mode === "all" || ORDER_STATUS_ORDER.indexOf(o.status) < warehouseIdx),
            ).length;
            return lateCount > 0 ? (
              <button
                type="button"
                onClick={() => setLateOnly((v) => !v)}
                className={`inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium ${
                  lateOnly
                    ? "bg-amber-500 text-white"
                    : "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-300"
                }`}
              >
                ⚠ опаздывают: {lateCount}
              </button>
            ) : null;
          })()}
          <span className="hidden text-xs uppercase tracking-wide text-slate-400 md:inline">Фильтры:</span>
          <FilterDropdown
            label="Категория"
            options={filterOptions.categories}
            value={filters.category}
            onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
          />
          <FilterDropdown
            label="Ответственный"
            options={filterOptions.owners}
            value={filters.ownerId}
            onChange={(v) => setFilters((f) => ({ ...f, ownerId: v }))}
          />
          <FilterDropdown
            label="Статус"
            options={filterOptions.statuses}
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            widthClass="w-64"
          />
          <div className="relative hidden md:block">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск…"
              className="h-8 w-44 rounded-md border border-slate-300 bg-white pl-2.5 pr-7 text-xs text-slate-900 placeholder:text-slate-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Очистить поиск"
                className="absolute right-0.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-slate-400"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Мобильная версия — карточки */}
      <div className="space-y-2 md:hidden">
        {filtered.map((o) => {
          const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
          const colorNames = o.lines.map((l) => l.productVariant.colorName);
          const firstLine = o.lines[0];
          return (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className={`block rounded-xl border bg-white p-3 active:bg-slate-50 ${
                o.isDelayed ? "border-red-200 dark:border-red-400/20 bg-red-50/40 dark:bg-red-400/10" : "border-slate-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <VariantVisual
                  variantPhotoUrl={firstLine?.productVariant.photoUrls[0] ?? null}
                  modelPhotoUrl={o.productModel.photoUrls[0] ?? null}
                  colorName={firstLine?.productVariant.colorName ?? null}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">{o.productModel.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    <span className="font-mono text-[11px]">{o.orderNumber}</span>
                    {colorNames.slice(0, 4).map((c, i) => (
                      <ColorChip key={i} name={c} size={10} />
                    ))}
                  </div>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] ${ORDER_STATUS_COLORS[o.status]}`}>
                  {ORDER_STATUS_LABELS[o.status]}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-slate-400">Кол-во</div>
                  <div className="font-semibold text-slate-900">{formatNumber(totalQty)}</div>
                </div>
                <div>
                  <div className="text-slate-400">Прибытие</div>
                  <div className="font-medium text-slate-900">{formatDate(o.arrivalPlannedDate)}</div>
                  {o.lateDays > 0 && (
                    <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">опаздывает {o.lateDays} дн</div>
                  )}
                </div>
                <div>
                  <div className="text-slate-400">Сумма</div>
                  <div className="font-medium text-slate-900">{o.totalAmount > 0 ? formatCurrency(o.totalAmount) : "—"}</div>
                </div>
              </div>
              {o.packagingNames.length > 0 && (
                <div className="mt-2 text-[11px] text-slate-500">
                  <span className="text-slate-400">Упаковка: </span>
                  {o.packagingNames.join(", ")}
                </div>
              )}
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            <div className="mb-2 text-3xl">⬡</div>
            {orders.length === 0 ? (
              <>
                Заказов пока нет.{" "}
                <Link href="/orders/new" className="text-slate-900 underline">
                  Создать первый?
                </Link>
              </>
            ) : (
              "Под фильтры ничего не подходит."
            )}
          </div>
        )}
      </div>

      {/* Десктопная версия — таблица */}
      <div className="scroll-x-hint hidden md:block">
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 shadow-[inset_0_-1px_0_rgb(226_232_240)]">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фото</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">№</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Изделие</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Тип</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Кол-во</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Фабрика</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Прибытие</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Упаковка</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Сумма</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Ответ.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((o) => {
              const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
              const colorNames = o.lines.map((l) => l.productVariant.colorName);
              const firstLine = o.lines[0];
              return (
                <ClickableRow
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className={`hover:bg-slate-50 ${o.isDelayed ? "bg-red-50/40 dark:bg-red-400/10" : ""}`}
                >
                  <td className="px-3 py-2">
                    <VariantVisual
                      variantPhotoUrl={firstLine?.productVariant.photoUrls[0] ?? null}
                      modelPhotoUrl={o.productModel.photoUrls[0] ?? null}
                      colorName={firstLine?.productVariant.colorName ?? null}
                      size={40}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/orders/${o.id}`} className="font-mono text-xs hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="max-w-[280px] px-3 py-2">
                    <div className="truncate text-slate-900" title={o.productModel.name}>
                      {o.productModel.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      {colorNames.length > 0
                        ? colorNames.map((c, i) => <ColorChip key={i} name={c} size={10} />)
                        : "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{ORDER_TYPE_LABELS[o.orderType]}</td>
                  <td className="px-3 py-2 text-right text-xs">{formatNumber(totalQty)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[o.status]}`}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                    {o.isDelayed && <span className="ml-1 text-xs text-red-600 dark:text-red-300">⚠</span>}
                    {o.hasIssue && <span className="ml-1 text-xs text-red-600 dark:text-red-300">🔴</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{o.factory?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {formatDate(o.arrivalPlannedDate)}
                    {o.lateDays > 0 && (
                      <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">· опаздывает {o.lateDays} дн</span>
                    )}
                  </td>
                  {/* §4: вместо простыни названий — «N поз.», список в тултипе */}
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {o.packagingNames.length > 0 ? (
                      <span
                        className="cursor-help rounded bg-slate-100 px-1.5 py-0.5"
                        title={o.packagingNames.join(", ")}
                      >
                        {o.packagingNames.length} поз.
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-slate-700 tabular-nums">
                    {o.totalAmount > 0 ? formatCurrency(o.totalAmount) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{o.owner.name}</td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-500">
            {orders.length === 0 ? (
              <>
                Заказов не найдено.{" "}
                <Link href="/orders/new" className="text-slate-900 underline">
                  Создать первый?
                </Link>
              </>
            ) : (
              "Под фильтры ничего не подходит."
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

