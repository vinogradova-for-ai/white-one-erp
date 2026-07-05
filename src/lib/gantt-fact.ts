/**
 * Гант показывает ФАКТ, а не только план (жалобы команды 05.07.2026:
 * «в Ганте в ОТК один набор заказов, в канбане другой»).
 *
 * Проблема: плашки рисуются по плановым датам, а колонка канбана — по статусу.
 * Когда статус отстаёт от плана (или опережает его), линия «сегодня» стоит
 * в чужой плашке, и по Ганту заказ «в ОТК», хотя по факту он ещё «В пошиве».
 *
 * Правило: линия «сегодня» ВСЕГДА внутри плашки активной по статусу фазы.
 *  - Заказ отстал от плана → активная плашка дотягивается до «сегодня»
 *    (lagDays = длина дотяжки), будущие фазы уезжают вправо, их длительности
 *    сохраняются.
 *  - Заказ опережает план → активная плашка начинается «сегодня», прошедшие
 *    фазы обрезаются по «сегодня».
 *
 * План в БД НЕ меняется — правится только отрисовка. Drag-контракт жестов
 * не тронут: стрелочки по-прежнему пишут те же поля БД.
 */

type AlignableBar = {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  lagDays?: number;
};

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, n: number): string {
  return toISO(new Date(parseISO(iso).getTime() + n * 86400000));
}

function dayDiff(aIso: string, bIso: string): number {
  return Math.round((parseISO(bIso).getTime() - parseISO(aIso).getTime()) / 86400000);
}

/**
 * Выравнивает плашки по факту: «сегодня» попадает в плашку activeIdx.
 * activeIdx = -1 (заказ завершён) или вне диапазона → без изменений.
 * Мутирует и возвращает переданный массив (bars строятся на месте в page.tsx).
 */
type RiskBar = AlignableBar & {
  state: "done" | "active" | "future";
  overdue?: boolean;
  nearlyDue?: boolean;
};

/**
 * Пересчёт рисков ПОСЛЕ выравнивания: сдвинутые вправо будущие фазы больше
 * не «просрочены» (их плановый конец уехал за сегодня), а дотянутая активная
 * фаза остаётся просроченной через lagDays (её end теперь = today).
 */
export function recomputeBarRisks<T extends RiskBar>(
  bars: T[],
  todayIso: string,
  nearlyDueDays: number,
): T[] {
  for (const b of bars) {
    const done = b.state === "done";
    b.overdue = !done && (b.end < todayIso || (b.lagDays ?? 0) > 0);
    const daysToEnd = dayDiff(todayIso, b.end);
    b.nearlyDue = !done && !b.overdue && daysToEnd >= 0 && daysToEnd <= nearlyDueDays;
  }
  return bars;
}

export function alignBarsToStatus<T extends AlignableBar>(
  bars: T[],
  activeIdx: number,
  todayIso: string,
): T[] {
  if (activeIdx < 0 || activeIdx >= bars.length) return bars;
  const active = bars[activeIdx];

  if (active.end < todayIso) {
    // Отстаёт: тянем конец активной фазы до сегодня, будущие едут вправо.
    const lag = dayDiff(active.end, todayIso);
    active.end = todayIso;
    active.lagDays = lag;
    for (let i = activeIdx + 1; i < bars.length; i++) {
      bars[i].start = addDaysIso(bars[i].start, lag);
      bars[i].end = addDaysIso(bars[i].end, lag);
    }
  } else if (active.start > todayIso) {
    // Опережает: фаза по факту уже идёт — начинаем её сегодня,
    // прошедшие фазы обрезаем по сегодня (порядок дат сохраняется).
    active.start = todayIso;
    for (let i = 0; i < activeIdx; i++) {
      if (bars[i].end > todayIso) bars[i].end = todayIso;
      if (bars[i].start > bars[i].end) bars[i].start = bars[i].end;
    }
  }
  return bars;
}
