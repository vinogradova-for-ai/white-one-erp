/**
 * Скелетон Ганта (аудит блок ④) — самый тяжёлый раздел (все заказы + упаковка
 * с include линий/вариантов/фото). Показываем каркас строк-полос, чтобы
 * переход на холодном Neon не выглядел как зависание.
 */
export default function GanttLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Загрузка Ганта">
      <div className="h-7 w-40 rounded-lg bg-slate-200" />
      {/* Фильтры */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-28 rounded-lg bg-slate-100" />
        ))}
      </div>
      {/* Строки-полосы */}
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-48 shrink-0 rounded bg-slate-100" />
            <div className="h-5 flex-1 rounded-full bg-slate-100" style={{ marginLeft: `${(i % 5) * 8}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
