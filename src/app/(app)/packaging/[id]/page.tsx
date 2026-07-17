import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PACKAGING_TYPE_LABELS, PACKAGING_TYPE_ICONS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/constants";
import { PACKAGING_STATUS_LABELS, PACKAGING_STATUS_COLORS } from "@/lib/status-machine/packaging-statuses";
import { PackagingStatusChanger } from "@/components/packaging/packaging-status-changer";
import { WriteOffButton } from "@/components/packaging/write-off-button";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { syncPackagingArrivalsCn, packagingBalances, MOVEMENT_KIND_LABELS } from "@/server/packaging-stock";
import { PackagingStockInventory } from "@/components/packaging/packaging-stock-inventory";

export default async function PackagingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Мини-товарный учёт (17.07): ленивые приходы Китая по завершённому производству.
  await syncPackagingArrivalsCn();
  const item = await prisma.packagingItem.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      statusLogs: {
        orderBy: { changedAt: "desc" },
        take: 20,
        include: { changedBy: { select: { name: true } } },
      },
      orderUsages: {
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              deletedAt: true,
              productModel: { select: { name: true } },
              lines: {
                select: {
                  quantity: true,
                  productVariant: { select: { colorName: true } },
                },
              },
            },
          },
        },
      },
      packagingOrderLines: {
        where: { packagingOrder: { status: { notIn: ["ARRIVED", "CANCELLED"] } } },
        select: { id: true, quantity: true, packagingOrder: { select: { id: true, orderNumber: true, status: true, expectedDate: true } } },
      },
    },
  });
  if (!item) return notFound();

  const activeUsages = item.orderUsages.filter(
    (u) => u.order.deletedAt === null && !["ON_SALE", "SHIPPED_WB"].includes(u.order.status),
  );
  const orderTotalQty = (u: (typeof item.orderUsages)[number]) =>
    u.order.lines.reduce((a, l) => a + l.quantity, 0);
  // Минус уже списанное (заказ в «Упаковке») — не давим на склад дважды (№3).
  const required = activeUsages.reduce(
    (s, u) => s + Math.max(0, Math.ceil(orderTotalQty(u) * Number(u.quantityPerUnit)) - (u.consumedQty ?? 0)),
    0,
  );
  // Активные линии заказов упаковки (не ARRIVED/CANCELLED): «в пути» отдельно от производства.
  const transitLines = item.packagingOrderLines.filter((l) => l.packagingOrder.status === "IN_TRANSIT");
  const productionLines = item.packagingOrderLines.filter((l) => l.packagingOrder.status !== "IN_TRANSIT");
  const inTransit = transitLines.reduce((a, l) => a + l.quantity, 0);
  const inProduction = productionLines.reduce((a, l) => a + l.quantity, 0);
  const available = item.stock + inProduction + inTransit;
  const shortage = Math.max(0, Math.ceil(required) - available);

  // «Движения склада» — журнал прихода/расхода из уже имеющихся данных (без
  // отдельной таблицы): приходы = приехавшие заказы упаковки; авто-списания =
  // consumedQty под заказы одежды (дата — вход заказа в «Упаковку»); ручные
  // списания и правки остатка — из аудита.
  const consumedOrderIds = item.orderUsages.filter((u) => u.consumedQty != null).map((u) => u.orderId);
  const [arrivedLines, packingLogs, auditRows] = await Promise.all([
    prisma.packagingOrderLine.findMany({
      where: { packagingItemId: id, packagingOrder: { status: "ARRIVED" } },
      select: {
        quantity: true,
        packagingOrder: { select: { id: true, orderNumber: true, arrivedDate: true, orderedDate: true } },
      },
    }),
    consumedOrderIds.length > 0
      ? prisma.orderStatusLog.findMany({
          where: { orderId: { in: consumedOrderIds }, toStatus: "PACKING" },
          orderBy: { changedAt: "desc" },
          select: { orderId: true, changedAt: true },
        })
      : Promise.resolve([]),
    prisma.auditLog.findMany({
      where: { entityType: "PackagingItem", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { changes: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);
  const packingDateByOrder = new Map<string, Date>();
  for (const log of packingLogs) {
    // desc-порядок: первая запись по заказу = последний вход в PACKING
    if (!packingDateByOrder.has(log.orderId)) packingDateByOrder.set(log.orderId, log.changedAt);
  }

  type Movement = { date: Date | null; delta: number | null; label: string; sub?: string; href?: string };
  const movements: Movement[] = [];
  for (const l of arrivedLines) {
    movements.push({
      date: l.packagingOrder.arrivedDate ?? l.packagingOrder.orderedDate,
      delta: l.quantity,
      label: `Приход — заказ упаковки ${l.packagingOrder.orderNumber}`,
      href: `/packaging-orders/${l.packagingOrder.id}`,
    });
  }
  for (const u of item.orderUsages) {
    if (u.consumedQty == null) continue;
    movements.push({
      date: packingDateByOrder.get(u.orderId) ?? null,
      delta: -u.consumedQty,
      label: `В изделие — ${u.order.productModel.name} (${u.order.orderNumber})`,
      href: `/orders/${u.order.id}`,
    });
  }
  for (const a of auditRows) {
    const ch = a.changes as Record<string, unknown> | null;
    if (!ch) continue;
    if (typeof ch.writeOff === "number") {
      movements.push({
        date: a.createdAt,
        delta: -ch.writeOff,
        label: "Списание вручную",
        sub: [typeof ch.reason === "string" ? ch.reason : null, a.user?.name].filter(Boolean).join(" · "),
      });
    } else if (typeof ch.stock === "number") {
      movements.push({
        date: a.createdAt,
        delta: null,
        label: `Остаток поправлен руками → ${ch.stock.toLocaleString("ru-RU")} шт`,
        sub: a.user?.name ?? undefined,
      });
    }
  }
  // Журнал мини-товарного учёта — источник правды с 17.07. Движения делим по
  // складам (Алёна 17.07: «понимать движение отдельно по Китаю и по Москве»);
  // переезд Китай→Москва виден в обеих колонках (там −, тут +).
  const [ledger, balances] = await Promise.all([
    prisma.packagingMovement.findMany({
      where: { packagingItemId: id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    packagingBalances([id]),
  ]);
  const balance = balances.get(id) ?? { cn: 0, msk: 0 };

  const movesCn: Movement[] = [];
  const movesMsk: Movement[] = [...movements]; // легаси-журнал (приходы/списания до 17.07) — это Москва
  for (const m of ledger) {
    const label = MOVEMENT_KIND_LABELS[m.kind] ?? m.kind;
    if (m.deltaCn !== 0 || m.kind === "ADJUST_CN") {
      movesCn.push({ date: m.date, delta: m.deltaCn !== 0 ? m.deltaCn : null, label, sub: m.note ?? undefined });
    }
    if (m.deltaMsk !== 0 || m.kind === "ADJUST_MSK") {
      movesMsk.push({ date: m.date, delta: m.deltaMsk !== 0 ? m.deltaMsk : null, label, sub: m.note ?? undefined });
    }
  }
  movesCn.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  movesMsk.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  const recentCn = movesCn.slice(0, 30);
  const recentMsk = movesMsk.slice(0, 30);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div className="flex min-w-0 flex-1 gap-3">
          {item.photoUrl && (
            <div className="shrink-0">
              <PhotoThumb url={item.photoUrl} size={80} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-500">
              <span className="mr-1">{PACKAGING_TYPE_ICONS[item.type]}</span>
              {PACKAGING_TYPE_LABELS[item.type]}
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">{item.name}</h1>
            {item.sku && <div className="font-mono text-xs text-slate-500">{item.sku}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs ${PACKAGING_STATUS_COLORS[item.status]}`}>
                {PACKAGING_STATUS_LABELS[item.status]}
              </span>
              {item.owner && <span className="text-xs text-slate-500">Ответственный: {item.owner.name}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <PackagingStatusChanger id={item.id} currentStatus={item.status} />
          <Link
            href={`/packaging/${item.id}/edit`}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Редактировать
          </Link>
        </div>
      </div>

      {/* Этапы разработки */}
      {(item.decisionDate || item.designReadyDate || item.sampleRequestedDate || item.sampleApprovedDate || item.productionStartDate) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Этапы разработки</h2>
          <div className="grid gap-2 md:grid-cols-5">
            {[
              { label: "Решение", date: item.decisionDate },
              { label: "Макет готов", date: item.designReadyDate },
              { label: "Образец заказан", date: item.sampleRequestedDate },
              { label: "Образец утверждён", date: item.sampleApprovedDate },
              { label: "Запуск в производство", date: item.productionStartDate },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</div>
                <div className={`mt-0.5 text-sm ${s.date ? "font-medium text-slate-900" : "text-slate-400"}`}>
                  {s.date ? formatDate(s.date) : "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Стоимость */}
      {(item.unitPriceRub || item.unitPriceCny) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Стоимость единицы</h2>
          {item.priceCurrency === "CNY" && item.unitPriceCny ? (
            <div className="text-sm">
              <div className="text-lg font-semibold text-slate-900">
                {Number(item.unitPriceCny).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ¥
              </div>
              {item.cnyRubRate && (
                <div className="text-xs text-slate-500">
                  ≈ {(Number(item.unitPriceCny) * Number(item.cnyRubRate)).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ по курсу {item.cnyRubRate.toString()}
                </div>
              )}
            </div>
          ) : item.unitPriceRub ? (
            <div className="text-lg font-semibold text-slate-900">
              {formatCurrency(Number(item.unitPriceRub))}
            </div>
          ) : null}
        </div>
      )}

      {/* Остатки по складам (мини-товарный учёт 17.07) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm dark:bg-slate-800">
          🇨🇳 Китай: <b>{balance.cn.toLocaleString("ru-RU")}</b> шт
        </span>
        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm dark:bg-slate-800">
          🇷🇺 Москва: <b>{balance.msk.toLocaleString("ru-RU")}</b> шт
        </span>
        <PackagingStockInventory packagingItemId={item.id} cn={balance.cn} msk={balance.msk} />
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Metric
          label="Склад Москва"
          value={balance.msk}
          accent={item.minStock != null && balance.msk < item.minStock ? "warn" : undefined}
          footer={`${item.minStock != null ? `мин: ${item.minStock} · ` : ""}правится инвентаризацией`}
        />
        <Metric label="Склад Китай" value={balance.cn} footer="приходы с производства" />
        <Metric
          label="В производстве"
          value={inProduction}
          footer={
            productionLines.length > 0
              ? `${productionLines.length} заказ(а) упаковки`
              : "Нет активных заказов"
          }
        />
        <Metric
          label="В пути"
          value={inTransit}
          footer={
            transitLines.length > 0
              ? `${transitLines.length} заказ(а) едут на склад`
              : "Ничего не едет"
          }
        />
        <DemandMetric
          required={Math.ceil(required)}
          shortage={shortage}
          breakdown={activeUsages
            .map((u) => ({
              orderId: u.order.id,
              orderNumber: u.order.orderNumber,
              modelName: u.order.productModel.name,
              qty: Math.ceil(orderTotalQty(u) * Number(u.quantityPerUnit)),
            }))
            .filter((b) => b.qty > 0)
            .sort((a, b) => b.qty - a.qty)}
        />
      </div>

      <WriteOffButton itemId={item.id} stock={item.stock} />

      {item.description && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Описание</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">{item.description}</p>
        </div>
      )}

      {item.notes && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Заметки</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">{item.notes}</p>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          Используется в заказах ({item.orderUsages.length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Заказ</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Товар</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Тираж</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">На единицу</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Всего</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Списано</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {item.orderUsages.map((u) => {
                const qty = orderTotalQty(u);
                const colors = u.order.lines.map((l) => l.productVariant.colorName).join(", ");
                return (
                <tr key={u.id}>
                  <td className="px-3 py-2">
                    <Link href={`/orders/${u.order.id}`} className="font-mono text-xs hover:underline">
                      {u.order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {u.order.productModel.name}{colors ? " · " + colors : ""}
                  </td>
                  <td className="px-3 py-2 text-right">{qty.toLocaleString("ru-RU")}</td>
                  <td className="px-3 py-2 text-right">{Number(u.quantityPerUnit)}</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {Math.ceil(qty * Number(u.quantityPerUnit)).toLocaleString("ru-RU")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {u.consumedQty != null ? (
                      <span className="font-medium text-emerald-700 dark:text-emerald-300">
                        −{u.consumedQty.toLocaleString("ru-RU")}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs ${ORDER_STATUS_COLORS[u.order.status]}`}>
                      {ORDER_STATUS_LABELS[u.order.status]}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {item.orderUsages.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-500">
              Пока ни один заказ не использует эту упаковку. Привязать можно на карточке заказа.
            </div>
          )}
        </div>
      </section>

      {(recentCn.length > 0 || recentMsk.length > 0) && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Движения по складам</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <MovementColumn title={`🇨🇳 Китай · остаток ${balance.cn.toLocaleString("ru-RU")} шт`} moves={recentCn} />
            <MovementColumn title={`🇷🇺 Москва · остаток ${balance.msk.toLocaleString("ru-RU")} шт`} moves={recentMsk} />
          </div>
        </section>
      )}

      {item.statusLogs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">История статусов</h2>
          <div className="rounded-2xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {item.statusLogs.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <span className="text-slate-500">{log.fromStatus ? PACKAGING_STATUS_LABELS[log.fromStatus] : "—"}</span>
                    <span className="mx-2 text-slate-400">→</span>
                    <span className="font-medium text-slate-900">{PACKAGING_STATUS_LABELS[log.toStatus]}</span>
                    {log.comment && <div className="text-xs text-slate-500">{log.comment}</div>}
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {formatDateTime(log.changedAt)}
                    <div>{log.changedBy.name}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function DemandMetric({
  required,
  shortage,
  breakdown,
}: {
  required: number;
  shortage: number;
  breakdown: Array<{ orderId: string; orderNumber: string; modelName: string; qty: number }>;
}) {
  const accentClass = shortage > 0 ? "border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-400/10" : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border p-4 ${accentClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Потребность по заказам</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{required.toLocaleString("ru-RU")}</div>
      <div className="mt-1 text-xs text-slate-500">
        {shortage > 0 ? `Дефицит: ${shortage.toLocaleString("ru-RU")} шт — нужно запустить в производство` : "Хватает"}
      </div>
      {breakdown.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-slate-200 pt-2 text-xs">
          {breakdown.map((b) => (
            <li key={b.orderId} className="flex items-baseline justify-between gap-2">
              <Link href={`/orders/${b.orderId}`} className="min-w-0 flex-1 truncate text-slate-700 hover:underline">
                <span className="font-mono text-[11px] text-slate-500">{b.orderNumber}</span>
                <span className="ml-1.5 text-slate-700">{b.modelName}</span>
              </Link>
              <span className="font-semibold tabular-nums text-slate-900">{b.qty.toLocaleString("ru-RU")} шт</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  footer,
  accent,
  inline,
}: {
  label: string;
  value: number;
  footer?: string;
  accent?: "ok" | "warn" | "danger";
  inline?: React.ReactNode;
}) {
  const accentClass =
    accent === "danger" ? "border-red-200 bg-red-50 dark:border-red-400/20 dark:bg-red-400/10" : accent === "warn" ? "border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10" : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border p-4 ${accentClass}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value.toLocaleString("ru-RU")}</div>
      {inline && <div className="mt-2">{inline}</div>}
      {footer && <div className="mt-1 text-xs text-slate-500">{footer}</div>}
    </div>
  );
}


function MovementColumn({ title, moves }: { title: string; moves: Array<{ date: Date | null; delta: number | null; label: string; sub?: string; href?: string }> }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">
        {title}
      </div>
      {moves.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">Движений пока нет</div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {moves.map((m, idx) => (
            <li key={idx} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <div className="min-w-0">
                {m.href ? (
                  <Link href={m.href} className="font-medium text-slate-900 hover:underline dark:text-slate-100">
                    {m.label}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-900 dark:text-slate-100">{m.label}</span>
                )}
                {m.sub && <div className="truncate text-xs text-slate-500">{m.sub}</div>}
              </div>
              <div className="flex shrink-0 items-baseline gap-3">
                {m.delta != null ? (
                  <span className={`font-semibold tabular-nums ${m.delta > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                    {m.delta > 0 ? "+" : "−"}{Math.abs(m.delta).toLocaleString("ru-RU")}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">якорь</span>
                )}
                <span className="text-xs text-slate-500">{m.date ? formatDate(m.date) : "—"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
