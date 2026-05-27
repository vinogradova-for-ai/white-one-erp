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

/**
 * Категория модели подходит к категории сезона, если её название содержит
 * (или содержится в) название канонической категории — нечётко, lowercase.
 * Примеры:
 *   ProductModel.category="Платье"     vs "Летние платья"     → совпадает ("платье" ∈ "летние платья")
 *   ProductModel.category="Пальто"     vs "Пальто"            → совпадает
 *   ProductModel.category="Трикотаж"   vs "Трикотажные костюмы" → совпадает
 *   ProductModel.category="Новые товары" — не совпадает ни с чем (показываем отдельно)
 */
export function matchSeasonCategory(modelCategory: string | null | undefined, seasonCategory: string): boolean {
  if (!modelCategory) return false;
  const a = modelCategory.toLowerCase().trim();
  const b = seasonCategory.toLowerCase().trim();
  if (a === b) return true;
  // Берём только значимые слова (>3 букв), чтобы «и/в/на» не мэтчились.
  const words = b.split(/\s+/).filter((w) => w.length > 3);
  return words.some((w) => a.includes(w));
}

/** Получить ключевое значимое слово категории — для отрисовки чипа. */
export function shortCategoryLabel(c: string): string {
  return c;
}
