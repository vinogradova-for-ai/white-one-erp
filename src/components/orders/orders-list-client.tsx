"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate, formatNumber } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_TYPE_LABELS } from "@/lib/constants";
import { VariantVisual } from "@/components/common/variant-visual";
import { ColorChip } from "@/components/common/color-chip";
import { ClickableRow } from "@/components/common/clickable-row";
import { FilterDropdown } from "@/components/common/filter-dropdown";
import { OrderStatus, OrderType } from "@prisma/client";

export type OrdersListRow = {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  status: OrderStatus;
  isDelayed: boolean;
  hasIssue: boolean;
  arrivalPlannedDate: string | null;
  productModel: { name: string; category: string; photoUrls: string[] };
  factory: { name: string } | null;
  owner: { id: string; name: string };
  lines: Array<{
    quantity: number;
    productVariant: { colorName: string; photoUrls: string[] };
  }>;
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
  const [filters, setFilters] = useState<{
    category: string[];
    ownerId: string[];
    status: string[];
  }>({ category: [], ownerId: [], status: [] });

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (filters.category.length && !filters.category.includes(o.productModel.category)) return false;
      if (filters.ownerId.length && !filters.ownerId.includes(o.owner.id)) return false;
      if (filters.status.length && !filters.status.includes(o.status)) return false;
      return true;
    });
  }, [orders, filters]);

  return (
    <div className="space-y-4">
      {/* Шапка в стиле Ганта v2: заголовок + счётчик + действие + фильтры в одной полосе */}
      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold text-slate-900">Заказы на производство</h1>
            <span className="text-xs text-slate-500">
              {filtered.length}/{orders.length}
            </span>
          </div>
          <Link
            href="/orders/new"
            className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
          >
            + Заказ
          </Link>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          <span className="text-xs uppercase tracking-wide text-slate-400">Фильтры:</span>
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
                o.isDelayed ? "border-red-200 bg-red-50/40" : "border-slate-200"
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
                </div>
                <div>
                  <div className="text-slate-400">Старт продаж</div>
                  <div className="font-medium capitalize text-slate-900">{salesStartMonth(o.arrivalPlannedDate)}</div>
                </div>
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
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

      {/* Десктопная версия — таблица */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
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
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Старт продаж</th>
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
                  className={`hover:bg-slate-50 ${o.isDelayed ? "bg-red-50/40" : ""}`}
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
                    {o.isDelayed && <span className="ml-1 text-xs text-red-600">⚠</span>}
                    {o.hasIssue && <span className="ml-1 text-xs text-red-600">🔴</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{o.factory?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{formatDate(o.arrivalPlannedDate)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 capitalize">
                    {salesStartMonth(o.arrivalPlannedDate)}
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
  );
}

const MONTH_NAMES_RU = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

function salesStartMonth(arrival: string | null | undefined): string {
  if (!arrival) return "—";
  const d = new Date(arrival);
  const day = d.getDate();
  let month = d.getMonth();
  let year = d.getFullYear();
  if (day > 20) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return `${MONTH_NAMES_RU[month]} ${year}`;
}
