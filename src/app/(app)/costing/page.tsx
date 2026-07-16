import Link from "next/link";
import { buildModelCosting } from "@/server/model-costing";

// Лист «Себестоимость» — тестовая модель полной себестоимости (жёсткий факт —
// в финсервисе .fin3). Смотреть можно всем ролям; правится всё в карточках
// (закуп — фасон, цены упаковки — упаковка, веса — цветомодели, деньги — карго).
export default async function CostingPage() {
  const { rows, rateNote } = await buildModelCosting();

  const fmt = (n: number | null) =>
    n == null ? "·" : n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });

  const gaps = rows.filter((r) => r.missing.length > 0).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Себестоимость</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Тестовая модель: закуп + упаковка + доставка (карго по весу) + склад Китай.
          Жёсткий факт — в финсервисе; сойдутся цифры — включим интеграцию.
        </p>
        {rateNote && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{rateNote}</p>
        )}
        {gaps > 0 && (
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            Дыр в данных: {gaps} фасонов — красные пометки в строках, клик ведёт в карточку.
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white dark:bg-slate-900">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="px-4 py-3 font-medium">Артикул</th>
              <th className="px-4 py-3 font-medium">Категория</th>
              <th className="px-4 py-3 text-right font-medium">Закуп</th>
              <th className="px-4 py-3 text-right font-medium">Упаковка</th>
              <th className="px-4 py-3 text-right font-medium">Доставка</th>
              <th className="px-4 py-3 text-right font-medium">Склад Китай</th>
              <th className="px-4 py-3 text-right font-medium">Итого ₽/шт</th>
              <th className="px-4 py-3 font-medium">Не хватает</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.modelId} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                <td className="px-4 py-2">
                  <Link href={`/models/${r.modelId}`} className="flex items-center gap-2.5">
                    {r.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded bg-slate-100 dark:bg-slate-800" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{r.artikul}</span>
                      <span className="block max-w-[200px] truncate text-xs text-slate-400">{r.name}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{r.category}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-800 dark:text-slate-200">{fmt(r.purchaseRub)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-800 dark:text-slate-200">{fmt(r.packagingRub)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-800 dark:text-slate-200">
                  {fmt(r.cargoRub)}
                  {r.cargoRub != null && (
                    <span className="block text-[10px] text-slate-400">по {r.cargoUnits.toLocaleString("ru-RU")} шт</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-400" title="Фикс-ставка (настройка)">
                  {fmt(r.warehouseRub)}
                </td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {fmt(r.totalRub)}
                </td>
                <td className="px-4 py-2">
                  {r.missing.length > 0 && (
                    <div className="flex max-w-[220px] flex-wrap gap-1">
                      {r.missing.map((mss, i) => (
                        <span key={i} className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-400/10 dark:text-rose-300">
                          {mss}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
