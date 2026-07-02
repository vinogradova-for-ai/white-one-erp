/**
 * Полоса-предупреждение об обрезке списка (аудит блок ④).
 *
 * Списки режутся жёстким take:N без пагинации. Раньше 501-й заказ просто молча
 * исчезал. Полноценную пагинацию строим отдельной задачей — здесь только
 * ЧЕСТНОСТЬ: если пришло ровно N записей (значит, скорее всего, есть ещё) —
 * показываем полосу «Показаны первые N — уточните фильтры».
 *
 * Использование: <ListCapNotice shown={rows.length} cap={500} />
 * Полоса появляется только когда shown >= cap.
 */
export function ListCapNotice({
  shown,
  cap,
  unit = "записей",
}: {
  shown: number;
  cap: number;
  unit?: string;
}) {
  if (shown < cap) return null;
  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-400/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      Показаны первые {cap} {unit} — возможно, есть ещё. Уточните фильтры, чтобы
      увидеть нужное.
    </div>
  );
}
