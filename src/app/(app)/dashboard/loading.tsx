/**
 * Скелетон «Главного» (аудит блок ④) — зоны «Сейчас / На неделе» + команда
 * месяца, всё серверными запросами к Neon. Каркас чек-листа вместо зависания.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Загрузка главного экрана">
      <div className="h-7 w-48 rounded-lg bg-slate-200" />
      {/* Три зоны задач */}
      {Array.from({ length: 2 }).map((_, z) => (
        <div key={z} className="space-y-2">
          <div className="h-4 w-32 rounded bg-slate-100" />
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-5 w-5 shrink-0 rounded bg-slate-100" />
                <div className="h-4 flex-1 rounded bg-slate-100" />
                <div className="h-4 w-16 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
