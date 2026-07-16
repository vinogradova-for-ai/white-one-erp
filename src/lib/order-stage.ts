import type { OrderStatus } from "@prisma/client";

/**
 * ЕДИНЫЙ источник правды об этапе заказа.
 *
 * Раньше «этап» считался в трёх местах по-разному и они расходились:
 *   1) колонка канбана — по своей таблице статус→колонка;
 *   2) активная фаза в Ганте — по битому словарю (там фигурировал
 *      `IN_PRODUCTION`, которого у заказа НЕ бывает, а реальный `SEWING`
 *      не распознавался → Гант залипал в «Разработке»);
 *   3) положение «сегодня» на полосах Ганта — по датам.
 * Из-за этого карточка могла стоять в «Производстве», а Гант рисовать
 * «Разработку» (и наоборот).
 *
 * Теперь и канбан, и Гант, и форма создания, и подпись на карточке берут
 * этап ТОЛЬКО отсюда — из статуса заказа. Разойтись физически нельзя.
 */

// Канонические фазы заказа: 4 фазы Ганта + «завершено».
export type OrderPhase = "preparation" | "production" | "qc" | "shipping" | "done";

// Фазы в порядке ленты Ганта (без "done" — это «всё закрыто, активной нет»).
export const ORDER_GANTT_PHASES = ["preparation", "production", "qc", "shipping"] as const;

/** Этап заказа из его статуса. Единственная функция-маппер. */
export function orderPhase(status: OrderStatus): OrderPhase {
  switch (status) {
    case "PREPARATION":
    case "FABRIC_ORDERED": // ткань заказана, но пошив ещё НЕ начался → это Разработка
      return "preparation";
    case "SEWING":
      return "production";
    case "QC":
    case "READY_SHIP": // прошёл/проходит ОТК на стороне фабрики
      return "qc";
    case "IN_TRANSIT":
      return "shipping";
    case "WAREHOUSE_MSK":
    case "PACKING":
    case "SHIPPED_WB":
    case "ON_SALE":
      return "done";
  }
}

/**
 * Индекс активной фазы на ленте Ганта (0=Разработка … 3=Доставка),
 * либо -1, если заказ уже завершён (все полосы закрашены как «done»).
 */
export function orderActivePhaseIndex(status: OrderStatus): number {
  const p = orderPhase(status);
  if (p === "done") return -1;
  return ORDER_GANTT_PHASES.indexOf(p);
}

/**
 * Колонка канбана для ЖИВОГО заказа (после заказа).
 * Для фазы «Разработка» возвращаем null — карточка остаётся в колонке
 * разработки по стадии фасона (Идея/Образец/…/Размерная сетка).
 */
export function orderKanbanColumn(
  status: OrderStatus,
): "production" | "qc" | "delivery" | "done" | null {
  switch (orderPhase(status)) {
    case "preparation":
      return null;
    case "production":
      return "production";
    case "qc":
      return "qc";
    case "shipping":
      return "delivery";
    case "done":
      return "done";
  }
}

/**
 * ГАНТ ПЕРВИЧЕН (Алёна, 05.07.2026): «график Ганта и заполнение инфо внутри
 * заказа первично; мы расставляем карточки в канбане так, как в Ганте; руками
 * в канбане поменять Производство на ОТК нельзя; девочки не отмечают статусы —
 * они двигают Гант». Единственное исключение — 4 колонки Разработки: там
 * карточки двигают руками (это детализация ДО заказа, в Ганте её нет).
 *
 * Поэтому колонка «после заказа» считается ПО ДАТАМ заказа (позиция «сегодня»
 * на полосе Ганта), а не по ручному статусу. Ручной статус остаётся для
 * бизнес-операций (приёмка, платежи) и как бейдж-справка.
 */
export type OrderPhaseDates = {
  handedToFactoryDate: Date | null;
  readyAtFactoryDate: Date | null;
  qcDate: Date | null;
};

/**
 * Колонка канбана «после заказа» по датам Ганта.
 * null → «сегодня» ещё до передачи на фабрику (или дата не заполнена):
 * карточка остаётся в колонках разработки по стадии фасона.
 * Пропущенная дата = фаза ещё не спланирована → считаем, что заказ в ней:
 * шьют, пока не проставлен конец производства, и т.д.
 */
export function orderKanbanColumnByDates(
  d: OrderPhaseDates,
  todayIso: string,
): "production" | "qc" | "delivery" | null {
  const iso = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
  const handed = iso(d.handedToFactoryDate);
  if (!handed || todayIso < handed) return null;
  const ready = iso(d.readyAtFactoryDate);
  if (!ready || todayIso < ready) return "production";
  const qc = iso(d.qcDate);
  if (!qc || todayIso < qc) return "qc";
  return "delivery";
}

/**
 * Этапы для выбора при создании заказа: 5 значений = 5 колонок канбана.
 * `label` — то, что видит Алёна; `value` — статус, который ляжет в БД.
 * Один этап ⇒ ровно одна колонка канбана и одна фаза Ганта.
 */
export const ORDER_CREATE_STAGES: ReadonlyArray<{ value: OrderStatus; label: string }> = [
  { value: "PREPARATION", label: "Разработка" },
  { value: "SEWING", label: "Производство" },
  { value: "QC", label: "ОТК" },
  { value: "IN_TRANSIT", label: "Доставка" },
  { value: "WAREHOUSE_MSK", label: "Завершено" },
];

// Все валидные статусы заказа (для валидаторов) — один список на проект.
export const ORDER_STATUS_VALUES = [
  "PREPARATION", "FABRIC_ORDERED", "SEWING", "QC", "READY_SHIP",
  "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE",
] as const;

/**
 * «Реально запущенные» заказы — те, где производство ФАКТИЧЕСКИ началось
 * (пошив и дальше). PREPARATION и FABRIC_ORDERED — это ещё разработка
 * (ткань заказана ≠ шьётся), их НЕ засчитываем в «факт выпуска» план/факта
 * и сезонных целей, иначе прогресс завышается незапущенными заказами.
 */
export const LAUNCHED_ORDER_STATUSES = [
  "SEWING", "QC", "READY_SHIP", "IN_TRANSIT",
  "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE",
] as const satisfies ReadonlyArray<OrderStatus>;

const LAUNCHED_SET = new Set<OrderStatus>(LAUNCHED_ORDER_STATUSES);

/** Заказ реально запущен в производство (пошив уже начался). */
export function isOrderLaunched(status: OrderStatus): boolean {
  return LAUNCHED_SET.has(status);
}
