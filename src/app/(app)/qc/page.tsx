import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

// Раздел «ОТК Китай» (прожарка 17.07): ОТК — отдельное мероприятие, как карго.
// Витрина всех проверок: что проверяется, какие партии, когда начали/закончили,
// сколько стоило. Заводятся мероприятия в карточке заказа (блок «ОТК Китай»).
export const dynamic = "force-dynamic";

export default async function QcPage() {
  const events = await prisma.chinaQc.findMany({
    where: { deletedAt: null },
    orderBy: [{ finishedAt: "asc" }, { date: "desc" }],
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          productModel: { select: { name: true, artikulBase: true, photoUrls: true } },
        },
      },
      batches: { select: { index: true, items: { select: { plannedQty: true } } } },
    },
  });

  const active = events.filter((e) => !e.finishedAt);
  const done = events.filter((e) => e.finishedAt);

  const rub = (e: (typeof events)[number]) =>
    e.rubRate != null ? Math.round(Number(e.amount) * Number(e.rubRate)) : null;

  const Table = ({ rows, title }: { rows: typeof events; title: string }) => (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {title} <span className="text-sm font-normal text-slate-400">{rows.length}</span>
      </h2>
      <div className="overflow-x-auto rounded-2xl bg-white dark:bg-slate-900">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="px-4 py-3 font-medium">Заказ</th>
              <th className="px-4 py-3 font-medium">Партии</th>
              <th className="px-4 py-3 font-medium">Начат</th>
              <th className="px-4 py-3 font-medium">Завершён</th>
              <th className="px-4 py-3 text-right font-medium">Стоимость</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const qty = e.batches.reduce((a, b) => a + b.items.reduce((x, i) => x + i.plannedQty, 0), 0);
              const r = rub(e);
              return (
                <tr key={e.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2">
                    <Link href={`/orders/${e.order.id}`} className="flex items-center gap-2.5 hover:underline">
                      {e.order.productModel.photoUrls[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.order.productModel.photoUrls[0]} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="h-9 w-9 shrink-0 rounded bg-slate-100 dark:bg-slate-800" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900 dark:text-slate-100">
                          {e.order.productModel.artikulBase || e.order.productModel.name}
                        </span>
                        <span className="block font-mono text-[11px] text-slate-400">{e.order.orderNumber}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                    {e.batches.length > 0
                      ? `${e.batches.map((b) => `№${b.index}`).join(", ")} · ${qty.toLocaleString("ru-RU")} шт`
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{formatDate(e.date)}</td>
                  <td className="px-4 py-2">
                    {e.finishedAt ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                        {formatDate(e.finishedAt)} ✓
                      </span>
                    ) : (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
                        идёт
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-800 dark:text-slate-200">
                    {r != null ? `${r.toLocaleString("ru-RU")} ₽` : `${Number(e.amount).toLocaleString("ru-RU")} ${e.currency}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">ОТК Китай</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Проверки качества на фабрике: партия → ОТК → карго. Мероприятие заводится в карточке заказа;
          факты начала и завершения сами уточняют Гант, стоимость идёт в себестоимость.
        </p>
      </div>
      {events.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          Мероприятий ОТК пока нет. Заведи первое в карточке заказа — блок «ОТК Китай».
        </div>
      ) : (
        <>
          {active.length > 0 && <Table rows={active} title="Идут" />}
          {done.length > 0 && <Table rows={done} title="Завершены" />}
        </>
      )}
    </div>
  );
}
