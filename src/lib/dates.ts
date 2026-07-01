/**
 * ЕДИНЫЙ источник «сегодня по Москве».
 *
 * Раньше moscowToday() был скопирован в 5 файлах и считал ПО-РАЗНОМУ:
 *   — чек-лист и дайджест: `(3*60 - getTimezoneOffset())` — на сервере в
 *     не-UTC зоне давало +6ч, корректно только на UTC;
 *   — гант/канбан/календарь: честный +3ч (UTC+3);
 *   — платежи: локальная полночь сервера без МСК вообще — на Vercel (UTC)
 *     платежи с 00:00 до 03:00 МСК жили «во вчера» и не считали просрочку.
 *
 * Правильно: Москва = UTC+3 круглый год (нет перехода на летнее время
 * с 2011 г.). Считаем не от локального времени сервера, а от абсолютного
 * времени (getTime), сдвинутого на +3ч — результат одинаков на любом хосте.
 *
 * Все экраны берут «сегодня» ТОЛЬКО отсюда — разойтись физически нельзя.
 */

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Текущий московский день как «YYYY-MM-DD». */
export function moscowTodayIso(now: Date = new Date()): string {
  return new Date(now.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Текущий московский день как Date = UTC-полночь этого дня.
 * Удобно для сравнений `plannedDate < moscowTodayStart()` (даты в БД — UTC).
 */
export function moscowTodayStart(now: Date = new Date()): Date {
  return new Date(`${moscowTodayIso(now)}T00:00:00.000Z`);
}

/** Текущий месяц по Москве как число YYYYMM (для план/факта и сезонов). */
export function moscowYearMonth(now: Date = new Date()): number {
  const iso = moscowTodayIso(now); // YYYY-MM-DD
  return Number(iso.slice(0, 4)) * 100 + Number(iso.slice(5, 7));
}
