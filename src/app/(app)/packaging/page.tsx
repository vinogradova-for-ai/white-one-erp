import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PACKAGING_TYPE_LABELS, PACKAGING_TYPE_ICONS } from "@/lib/constants";
import { PACKAGING_STATUS_LABELS, PACKAGING_STATUS_COLORS } from "@/lib/status-machine/packaging-statuses";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { ClickableRow } from "@/components/common/clickable-row";
import { ConsumeShippedButton } from "@/components/packaging/consume-shipped-button";
import { syncPackagingArrivalsCn, packagingBalances } from "@/server/packaging-stock";

export default async function PackagingListPage() {
  // Мини-товарный учёт (17.07): ленивые приходы Китая по завершённому производству.
  await syncPackagingArrivalsCn();
  // «Неучтённый расход» (правка №4): заказы отгружены, а упаковка не списана —
  // склад на бумаге больше, чем в реальности. Списывается кнопкой ниже.
  const unconsumedShipped = await prisma.orderPackaging.findMany({
    where: {
      consumedQty: null,
      order: { deletedAt: null, status: { in: ["SHIPPED_WB", "ON_SALE"] } },
    },
    select: {
      quantityPerUnit: true,
      order: { select: { lines: { select: { quantity: true } } } },
    },
  });
  const unconsumedQty = unconsumedShipped.reduce((s, u) => {
    const orderQty = u.order.lines.reduce((a, l) => a + l.quantity, 0);
    return s + Math.max(0, Math.ceil(orderQty * Number(u.quantityPerUnit)));
  }, 0);

  const items = await prisma.packagingItem.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      orderUsages: {
        where: {
          order: {
            deletedAt: null,
            status: { notIn: ["ON_SALE", "SHIPPED_WB"] },
          },
        },
        select: {
          quantityPerUnit: true,
          consumedQty: true,
          order: { select: { lines: { select: { quantity: true } } } },
        },
      },
      packagingOrderLines: {
        where: { packagingOrder: { status: { notIn: ["ARRIVED", "CANCELLED"] } } },
        select: { quantity: true, packagingOrder: { select: { status: true } } },
      },
    },
  });

  const balances = await packagingBalances(items.map((i) => i.id));

  const rows = items.map((i) => {
    const balance = balances.get(i.id) ?? { cn: 0, msk: 0 };
    const required = i.orderUsages.reduce((sum, u) => {
      const orderQty = u.order.lines.reduce((a, l) => a + l.quantity, 0);
      // Уже списанное со склада (заказ в «Упаковке») не считаем повторно:
      // иначе одно и то же требование давит и на stock, и на потребность (№3).
      const remaining = Math.max(0, Math.ceil(orderQty * Number(u.quantityPerUnit)) - (u.consumedQty ?? 0));
      return sum + remaining;
    }, 0);
    // Активные заказы упаковки делим: «в пути» (IN_TRANSIT) видно отдельно от производства.
    const inTransit = i.packagingOrderLines
      .filter((l) => l.packagingOrder.status === "IN_TRANSIT")
      .reduce((a, l) => a + l.quantity, 0);
    const inProduction = i.packagingOrderLines
      .filter((l) => l.packagingOrder.status !== "IN_TRANSIT")
      .reduce((a, l) => a + l.quantity, 0);
    const available = i.stock + inProduction + inTransit;
    const shortage = Math.max(0, Math.ceil(required) - available);
    return {
      ...i,
      inProduction,
      inTransit,
      required: Math.ceil(required),
      shortage,
      lowStock: i.minStock != null && i.stock < i.minStock,
      stockCn: balance.cn,
      stockMsk: balance.msk,
    };
  });

  const activeCount = rows.filter((r) => r.isActive).length;
  const shortageRows = rows.filter((r) => r.shortage > 0).sort((a, b) => b.shortage - a.shortage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Упаковка</h1>
          <p className="text-sm text-slate-500">Активных: {activeCount} из {rows.length}</p>
        </div>
        <Link
          href="/packaging/new"
          className="flex h-11 shrink-0 items-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 active:bg-slate-800"
        >
          + Добавить
        </Link>
      </div>

      {unconsumedQty > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-400/20 dark:bg-amber-400/10">
          <div className="text-sm text-amber-900 dark:text-amber-300">
            <span className="font-medium">
              Не списано по отгруженным заказам: {unconsumedQty.toLocaleString("ru-RU")} шт
            </span>{" "}
            <span className="text-xs opacity-80">
              ({unconsumedShipped.length} строк) — остатки на складе показаны с этим излишком
            </span>
          </div>
          <ConsumeShippedButton totalQty={unconsumedQty} rows={unconsumedShipped.length} />
        </div>
      )}

      {shortageRows.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <div className="font-medium text-amber-900 dark:text-amber-300">
              Нужно запустить в производство: {shortageRows.length}
            </div>
            <Link
              href="/packaging-orders/new"
              className="inline-flex h-9 shrink-0 items-center rounded-lg bg-amber-600 px-3 text-xs font-medium text-white hover:bg-amber-700 active:bg-amber-700"
            >
              + Заказ упаковки
            </Link>
          </div>
          <ul className="space-y-1 text-sm text-amber-900 dark:text-amber-300">
            {shortageRows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/packaging/${r.id}`} className="hover:underline">
                  {r.name}
                </Link>
                <span className="flex items-center gap-2 text-xs">
                  нужно {r.required.toLocaleString("ru-RU")} шт · есть {(r.stock + r.inProduction + r.inTransit).toLocaleString("ru-RU")} ·
                  <span className="font-semibold text-red-700 dark:text-red-300">
                    дефицит {r.shortage.toLocaleString("ru-RU")}
                  </span>
                  {/* Топ-13: заказ в один клик с предзаполненным количеством */}
                  <Link
                    href={`/packaging-orders/new?itemId=${r.id}&qty=${r.shortage}`}
                    className="inline-flex min-h-[30px] items-center rounded-lg bg-slate-900 px-2.5 text-[11px] font-medium text-white hover:bg-slate-800"
                  >
                    Заказать
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Мобильная версия */}
      <div className="space-y-2 md:hidden">
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/packaging/${r.id}`}
            className={`block rounded-xl border bg-white p-3 active:bg-slate-50 ${r.shortage > 0 ? "border-red-200 dark:border-red-400/20" : "border-slate-200"} ${r.isActive ? "" : "opacity-60"}`}
          >
            <div className="flex items-center gap-3">
              {r.photoUrl ? (
                <PhotoThumb url={r.photoUrl} size={44} />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
                  нет фото
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-900">{r.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <span>{PACKAGING_TYPE_ICONS[r.type]} {PACKAGING_TYPE_LABELS[r.type]}</span>
                  {r.sku && <span className="font-mono text-[11px] text-slate-400">{r.sku}</span>}
                </div>
              </div>
              {r.shortage > 0 ? (
                <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-300">
                  дефицит {r.shortage.toLocaleString("ru-RU")}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-emerald-600 dark:text-emerald-300">✓ Хватает</span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
              <div>
                <div className="text-slate-400">🇨🇳 / 🇷🇺</div>
                <div className={`font-semibold ${r.lowStock ? "text-amber-700 dark:text-amber-300" : "text-slate-900"}`}>
                  {r.stockCn.toLocaleString("ru-RU")} / {r.stockMsk.toLocaleString("ru-RU")}
                </div>
              </div>
              <div>
                <div className="text-slate-400">В произв.</div>
                <div className="font-medium text-slate-900">{r.inProduction > 0 ? r.inProduction.toLocaleString("ru-RU") : "—"}</div>
              </div>
              <div>
                <div className="text-slate-400">В пути</div>
                <div className="font-medium text-slate-900">{r.inTransit > 0 ? r.inTransit.toLocaleString("ru-RU") : "—"}</div>
              </div>
              <div>
                <div className="text-slate-400">Нужно</div>
                <div className="font-medium text-slate-900">{r.required > 0 ? r.required.toLocaleString("ru-RU") : "—"}</div>
              </div>
            </div>
          </Link>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            <div className="mb-2 text-3xl">▯</div>
            Карточек упаковки пока нет.{" "}
            <Link href="/packaging/new" className="text-slate-900 underline">Создать первую?</Link>
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
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Название</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Тип</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Склад 🇨🇳 / 🇷🇺</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">В производстве</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">В пути</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Потребность</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-slate-500">Дефицит</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <ClickableRow key={r.id} href={`/packaging/${r.id}`} className={`hover:bg-slate-50 ${r.isActive ? "" : "text-slate-400"}`}>
                <td className="px-3 py-2">
                  {r.photoUrl ? (
                    <PhotoThumb url={r.photoUrl} size={40} />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
                      нет фото
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link href={`/packaging/${r.id}`} className="font-medium text-slate-900 hover:underline">
                    {r.name}
                  </Link>
                  {r.sku && <div className="font-mono text-xs text-slate-400">{r.sku}</div>}
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">
                  <span className="mr-1">{PACKAGING_TYPE_ICONS[r.type]}</span>
                  {PACKAGING_TYPE_LABELS[r.type]}
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={r.lowStock ? "font-semibold text-amber-700 dark:text-amber-300" : ""}>
                    <span title="Китай">🇨🇳 {r.stockCn.toLocaleString("ru-RU")}</span>
                    <span className="mx-1 text-slate-300">·</span>
                    <span title="Москва">🇷🇺 {r.stockMsk.toLocaleString("ru-RU")}</span>
                  </span>
                  {r.minStock != null && (
                    <div className="text-[10px] text-slate-400">мин: {r.minStock}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.inProduction > 0 ? r.inProduction.toLocaleString("ru-RU") : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.inTransit > 0 ? r.inTransit.toLocaleString("ru-RU") : "—"}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">
                  {r.required > 0 ? r.required.toLocaleString("ru-RU") : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.shortage > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      {/* Единый формат с шапкой: «дефицит N», не «-N» (§4) */}
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-300">
                        дефицит {r.shortage.toLocaleString("ru-RU")}
                      </span>
                      <Link
                        href={`/packaging-orders/new?itemId=${r.id}&qty=${r.shortage}`}
                        className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800"
                      >
                        Заказать
                      </Link>
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-600 dark:text-emerald-300">Хватает</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className={`rounded px-2 py-0.5 ${PACKAGING_STATUS_COLORS[r.status]}`}>
                    {PACKAGING_STATUS_LABELS[r.status]}
                  </span>
                </td>
              </ClickableRow>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-12 text-center text-sm text-slate-500">
                  Карточек упаковки пока нет. Нажмите «+ Добавить карточку», чтобы создать первую.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>

      <p className="text-xs text-slate-400">
        Потребность считается по заказам, которые ещё не отгружены на WB. Дефицит = потребность − (склад + то,
        что уже в производстве у поставщика). Если есть дефицит — запускайте производство упаковки.
      </p>
    </div>
  );
}
