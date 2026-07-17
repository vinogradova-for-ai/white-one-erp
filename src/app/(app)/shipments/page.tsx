import Link from "next/link";
import { formatDate, formatNumber } from "@/lib/format";
import { loadShipmentsWithPreview } from "@/server/cargo-preview";
import { CargoContentCell } from "@/components/shipments/cargo-content-cell";
import { SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS } from "@/lib/constants";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { Role } from "@prisma/client";
import { ClickableRow } from "@/components/common/clickable-row";
import { NewShipmentButton } from "@/components/shipments/new-shipment-button";

// Раздел «Карго» (бывш. «Поставки», переименован по слову Алёны 05.07) —
// группы партий, едущих на склад МСК; одна поставка = одна карго-накладная.
// Старое окно логистики (заказы в пути) осталось вкладкой «Заказы в пути» (/incoming).
export default async function ShipmentsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role as Role | undefined;
  const canManage = role ? can(role, "shipment.manage") : false;

  const shipments = await loadShipmentsWithPreview();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Карго</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Партии заказов, едущие на склад: {shipments.length}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canManage ? <NewShipmentButton /> : null}
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            <span className="rounded-md bg-white px-3 py-1 text-sm font-medium text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100">
              Карго
            </span>
            <Link
              href="/shipments/timeline"
              className="rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700"
            >
              График
            </Link>
            <Link
              href="/incoming"
              className="rounded-md px-3 py-1 text-sm text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-700"
            >
              Заказы в пути
            </Link>
          </div>
        </div>
      </div>

      {shipments.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          Карго пока нет. Нажмите «+ Карго», затем добавьте в него заказы.
        </div>
      ) : (
        <>
        {/* Мобилка: список карточек вместо широкой таблицы (маркер: shipments-mobile-card) */}
        <div className="space-y-2 md:hidden">
          {shipments.map((s) => {
            const orders = s.batches.length;
            const units = s.batches.reduce(
              (a, b) => a + b.items.reduce((x, i) => x + i.plannedQty, 0),
              0,
            );
            const pkgCount = s.packagingBatches.length;
            return (
              <Link
                key={s.id}
                href={`/shipments/${s.id}`}
                className="shipments-mobile-card block rounded-2xl border border-slate-200 bg-white p-3 active:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:active:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900 dark:text-slate-100">{s.preview.title}</div>
                    <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                      {s.number}
                      {s.cargoNumber ? ` · ${s.cargoNumber}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium ${SHIPMENT_STATUS_COLORS[s.status]}`}>
                    {SHIPMENT_STATUS_LABELS[s.status]}
                  </span>
                </div>

                <div className="mt-2">
                  <CargoContentCell preview={s.preview} compact />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
                  {orders > 0 && <span>{orders} зак. · {formatNumber(units)} шт</span>}
                  {pkgCount > 0 && <span>📦 {pkgCount}</span>}
                  {(s.placesCount != null || s.weightKg != null) && (
                    <span>
                      {s.placesCount ?? "—"} мест · {s.weightKg != null ? `${Number(s.weightKg).toLocaleString("ru-RU")} кг` : "—"}
                    </span>
                  )}
                </div>

                {s.amountUsdt != null && (
                  <div className="mt-2 flex items-center gap-1.5 text-sm">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{Number(s.amountUsdt).toLocaleString("ru-RU")} USDT</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      s.cargoPaidAt
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
                    }`}>
                      {s.cargoPaidAt ? "оплачено" : "не оплачено"}
                    </span>
                  </div>
                )}

                <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>{s.departDate ? formatDate(s.departDate) : "—"}</span>
                  <span aria-hidden>→</span>
                  <span>
                    {s.arriveDate ? formatDate(s.arriveDate) : "—"}
                    {s.arrivalActualDate && (
                      <span className="ml-1 text-emerald-700 dark:text-emerald-300">/ {formatDate(s.arrivalActualDate)}</span>
                    )}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Десктоп: широкая таблица (без изменений) */}
        <div className="hidden overflow-hidden rounded-2xl bg-white dark:bg-slate-900 md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-4 py-3 font-medium">Карго</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Внутри</th>
                <th className="px-4 py-3 font-medium text-right">Мест · вес</th>
                <th className="px-4 py-3 font-medium text-right">Карго, USDT</th>
                <th className="px-4 py-3 font-medium">Выезд</th>
                <th className="px-4 py-3 font-medium">Прибытие план / факт</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => {
                return (
                  <ClickableRow
                    key={s.id}
                    href={`/shipments/${s.id}`}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="max-w-[220px] px-4 py-3">
                      <div className="truncate font-medium text-slate-900 dark:text-slate-100">{s.preview.title}</div>
                      <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        {s.number}
                        {s.cargoNumber ? ` · ${s.cargoNumber}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ${SHIPMENT_STATUS_COLORS[s.status]}`}>
                        {SHIPMENT_STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <CargoContentCell preview={s.preview} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {s.placesCount != null || s.weightKg != null
                        ? `${s.placesCount ?? "—"} · ${s.weightKg != null ? `${Number(s.weightKg).toLocaleString("ru-RU")} кг` : "—"}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {s.amountUsdt != null ? (
                        <>
                          <span className="text-slate-900 dark:text-slate-100">{Number(s.amountUsdt).toLocaleString("ru-RU")}</span>
                          <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            s.cargoPaidAt
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
                          }`}>
                            {s.cargoPaidAt ? "оплачено" : "не оплачено"}
                          </span>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{s.departDate ? formatDate(s.departDate) : "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {s.arriveDate ? formatDate(s.arriveDate) : "—"}
                      {s.arrivalActualDate && (
                        <span className="ml-1 text-emerald-700 dark:text-emerald-300">/ {formatDate(s.arrivalActualDate)}</span>
                      )}
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
