/**
 * Сезоны и нагрузка по месяцам.
 *
 * Алёна (27.05.2026): «хочу прописать цель по сезонам до конца года, чтобы
 * понимать когда и с кого спрашивать за объём артикулов». Глобальные KPI:
 *   — 10 новых артикулов в месяц
 *   — 20 000 выпущенных штук в месяц
 * Команда: руководитель, 1 дизайнер, 3 продакт-менеджера. Каждый PM имеет
 * KPI в штуках + кол-во выпущенных заказов. Цель отдела — редактируемая.
 *
 * 8 категорий, разнесены по сезонам:
 *   Лето (июн-авг)   — Летние платья, Летние костюмы, Блузки
 *   Осень (сен-ноя)  — Пальто, Полупальто, Джинсы, Брюки, Трикотажные костюмы
 *   Зима (дек)       — Пальто, Полупальто, Трикотажные костюмы (продолжение осенне-зимней капсулы)
 *
 * Данные в БД (ProductModel.category) — свободная строка. Совпадение
 * категорий с сезонами делаем нечёткое: lowercase + substring match.
 * См. matchSeasonCategory().
 */

export const MONTHLY_GOAL = {
  models: 10,
  quantity: 20_000,
} as const;

export type Season = {
  key: string;
  title: string;
  /** YYYYMM в этом сезоне (включительно) */
  months: number[];
  /** Каноничные категории сезона. ProductModel.category матчится по lowercase substring. */
  categories: string[];
};

export const SEASONS: ReadonlyArray<Season> = [
  {
    key: "summer-2026",
    title: "Лето 2026",
    months: [202606, 202607, 202608],
    categories: ["Летние платья", "Летние костюмы", "Блузки"],
  },
  {
    key: "autumn-2026",
    title: "Осень 2026",
    months: [202609, 202610, 202611],
    categories: ["Пальто", "Полупальто", "Джинсы", "Брюки", "Трикотажные костюмы"],
  },
  {
    key: "winter-2026",
    title: "Зима 2026",
    months: [202612],
    categories: ["Пальто", "Полупальто", "Трикотажные костюмы"],
  },
  // 2027 — заведены заранее по тем же правилам, чтобы с января экран «Цели»
  // не откатывался молча на «Лето 2026» (аудит блок ④). Зима-2026 (декабрь)
  // и зима-2027 (январь-февраль) — одна осенне-зимняя капсула, но разнесены
  // по годам, чтобы дефолт всегда указывал на актуальный сезон.
  {
    key: "winter-2027",
    title: "Зима 2027",
    months: [202701, 202702],
    categories: ["Пальто", "Полупальто", "Трикотажные костюмы"],
  },
  {
    key: "summer-2027",
    title: "Лето 2027",
    months: [202706, 202707, 202708],
    categories: ["Летние платья", "Летние костюмы", "Блузки"],
  },
  {
    key: "autumn-2027",
    title: "Осень 2027",
    months: [202709, 202710, 202711],
    categories: ["Пальто", "Полупальто", "Джинсы", "Брюки", "Трикотажные костюмы"],
  },
  {
    key: "winter-2027-dec",
    title: "Зима 2027 (декабрь)",
    months: [202712],
    categories: ["Пальто", "Полупальто", "Трикотажные костюмы"],
  },
];

export const ALL_PRODUCT_CATEGORIES: ReadonlyArray<string> = [
  "Пальто",
  "Полупальто",
  "Летние платья",
  "Летние костюмы",
  "Блузки",
  "Джинсы",
  "Брюки",
  "Трикотажные костюмы",
];

export function seasonFor(yearMonth: number): Season | null {
  for (const s of SEASONS) {
    if (s.months.includes(yearMonth)) return s;
  }
  return null;
}

// Значимые слова названия (>3 букв) в нижнем регистре.
// «и/в/на» и короткие связки отбрасываем.
function significantWords(s: string): string[] {
  return s
    .toLowerCase()
    .trim()
    .split(/[\s,]+/)
    .filter((w) => w.length > 3);
}

// Два слова считаем «одним словом с учётом склонения», если общий префикс
// достаточно длинный (≥4 буквы или всё короткое слово целиком). Так
// «костюм»/«костюмы», «летний»/«летние» матчатся, а «пальто»/«полупальто» — НЕТ
// (у них нет общего начала: одно начинается с «полу»).
function sameWordStem(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  let common = 0;
  while (common < min && a[common] === b[common]) common++;
  return common >= 4;
}

/**
 * Насколько модель подходит к ОДНОЙ категории сезона (сила совпадения ≥ 0).
 * 0 — не совпадает. Больше — совпадает точнее.
 *
 * Матчим по СЛОВАМ целиком (не подстрокой), поэтому «полупальто» больше НЕ
 * матчится с «пальто» (это разные слова), а «летние платья» не тянет за собой
 * «летние костюмы» по общему «летние» — их различает второе слово.
 *
 * Сила = число общих значимых слов; точное равенство названий — максимум.
 */
export function seasonCategoryMatchScore(
  modelCategory: string | null | undefined,
  seasonCategory: string,
): number {
  if (!modelCategory) return 0;
  const a = modelCategory.toLowerCase().trim();
  const b = seasonCategory.toLowerCase().trim();
  if (a === b) return 1000; // точное совпадение — вне конкуренции
  const aw = significantWords(a);
  const bw = significantWords(b);
  if (bw.length === 0) return 0;
  // Сколько значимых слов категории сезона нашли пару в названии модели
  // (с учётом склонения по общему корню).
  const common = bw.filter((w) => aw.some((x) => sameWordStem(x, w))).length;
  return common;
}

/**
 * Единственная категория сезона, к которой относится модель, — ЛУЧШАЯ из всех
 * (max score). Если ничьих несколько или совпадений нет — null (модель уходит
 * в «прочее», а не двоится по нескольким чипам).
 *
 * Возвращает индекс лучшей категории в переданном списке.
 * Примеры (categories = ["Пальто","Полупальто",…]):
 *   "Полупальто"     → "Полупальто" (score 1000 vs 0 у «Пальто»)
 *   "Пальто"         → "Пальто"
 *   "Летний костюм"  → "Летние костюмы" (общее слово «костюм»), НЕ «Летние платья»
 */
export function resolveSeasonCategory(
  modelCategory: string | null | undefined,
  categories: ReadonlyArray<string>,
): number {
  let bestIdx = -1;
  let bestScore = 0;
  let tie = false;
  for (let i = 0; i < categories.length; i++) {
    const score = seasonCategoryMatchScore(modelCategory, categories[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true; // равная сила у двух категорий — не относим никуда
    }
  }
  return tie ? -1 : bestIdx;
}

/**
 * Категория модели подходит к категории сезона — с учётом всего набора
 * категорий сезона, чтобы одна модель попала РОВНО в один чип (не двоилась).
 * Используется при разбивке «По категориям сезона».
 */
export function matchSeasonCategory(
  modelCategory: string | null | undefined,
  seasonCategory: string,
  seasonCategories: ReadonlyArray<string>,
): boolean {
  const idx = resolveSeasonCategory(modelCategory, seasonCategories);
  return idx >= 0 && seasonCategories[idx] === seasonCategory;
}

/** Получить ключевое значимое слово категории — для отрисовки чипа. */
export function shortCategoryLabel(c: string): string {
  return c;
}
