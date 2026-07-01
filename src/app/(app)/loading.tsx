/**
 * Скелетон загрузки для всех экранов кабинета (аудит блок ④).
 * Все страницы — тяжёлые force-dynamic запросы к Neon; на холодной базе
 * переход выглядел как зависание. Показываем каркас в стиле кабинета:
 * заголовок + сетка карточек-плейсхолдеров.
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Загрузка">
      {/* Заголовок */}
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-lg bg-slate-200" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-100" />
      </div>

      {/* Строка «карточек-метрик» */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-16 rounded bg-slate-100" />
            <div className="mt-3 h-5 w-24 rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Крупный блок-таблица */}
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100" />
            <div className="h-4 flex-1 rounded bg-slate-100" />
            <div className="h-4 w-20 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
