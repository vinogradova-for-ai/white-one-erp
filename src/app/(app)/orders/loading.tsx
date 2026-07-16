/**
 * Скелетон списка заказов (аудит блок ④) — тяжёлый запрос (take:500 с линиями,
 * вариантами, упаковкой и фото). Каркас списка вместо зависания на холодном Neon.
 */
export default function OrdersLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Загрузка заказов">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 rounded-lg bg-slate-200" />
        <div className="h-8 w-32 rounded-lg bg-slate-100" />
      </div>
      {/* Фильтры */}
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-28 rounded-lg bg-slate-100" />
        ))}
      </div>
      {/* Строки таблицы */}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <div className="h-12 w-12 shrink-0 rounded-lg bg-slate-100" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-1/2 rounded bg-slate-200" />
              <div className="h-3 w-1/3 rounded bg-slate-100" />
            </div>
            <div className="h-6 w-24 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
