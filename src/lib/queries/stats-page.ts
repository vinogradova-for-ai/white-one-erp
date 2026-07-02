import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveModelCost, type ModelCostInput } from "@/lib/calculations/resolve-model-cost";
import {
  inMonth,
  monthBounds,
  moscowMonth,
  statusAtLeast,
} from "@/lib/queries/team-month-stats";

/**
 * Расчёт для страницы «Статистика» (/stats).
 *
 * Переиспользует ЧЕСТНЫЕ правила счёта этапов из team-month-stats.ts:
 * считаем ТОЛЬКО свершившиеся факты (реальные даты + реально достигнутый статус),
 * плановые даты в счёт этапов НЕ идут. Границы месяца — по МСК (monthBounds).
 *
 * Даёт пять блоков (см. типы ниже):
 *  a) тренд 6/12 месяцев (заказано/получено: фасоны, штуки, деньги ₽);
 *  b) сравнение месяца с прошлым (заказано шт, получено шт, % вовремя, цикл);
 *  c) люди за месяц (план/факт, % вовремя, цикл + дельта);
 *  d) фабрики за месяц (объём, ср. опоздание, кол-во заказов);
 *  e) операционные деньги отдела продукта за месяц.
 *
 * ⚠️ ГРАНИЦА: никакой выручки/маржи/продаж WB — только операционка продукта.
 * Минимум запросов, вся группировка в JS, без N+1.
 */

// ── Общие типы ──────────────────────────────────────────────────────────

export type TrendMetricKey = "units" | "models" | "money";

export type TrendMonth = {
  /** YYYYMM месяца. */
  yearMonth: number;
  /** Короткая подпись «янв», «фев» … */
  label: string;
  ordered: { models: number; units: number; money: number };
  received: { models: number; units: number; money: number };
};

export type CompareCard = {
  /** Значение за выбранный месяц. */
  value: number;
  /** Значение за прошлый месяц (для дельты). */
  prev: number;
};

export type MonthCompare = {
  orderedUnits: CompareCard;
  receivedUnits: CompareCard;
  /** % заказов, прибывших вовремя (0..100). */
  onTimePct: CompareCard;
  /** Медианный цикл в днях. */
  cycleDays: CompareCard;
};

export type PersonRow = {
  ownerId: string;
  ownerName: string;
  /** План/факт фасоны. planModels null — плана нет (не PM). */
  factModels: number;
  planModels: number | null;
  factUnits: number;
  planUnits: number | null;
  /** % вовремя по прибывшим в месяце заказам этого человека. null — прибытий не было. */
  onTimePct: number | null;
  /** Медианный цикл (дн) по прибывшим в месяце. null — прибытий не было. */
  cycleDays: number | null;
  /** Медианный цикл прошлого месяца — для стрелки. null — не с чем сравнить. */
  cycleDaysPrev: number | null;
};

export type FactoryRow = {
  factoryId: string;
  factoryName: string;
  orderedUnits: number;
  receivedUnits: number;
  /** Кол-во заказов, прибывших в месяце. */
  arrivedOrders: number;
  /** Среднее опоздание в днях (avg max(0, actual − planned)) по прибывшим. */
  avgLateDays: number;
};

export type ProductMoney = {
  /** Заказано на сумму (Σ по заказам с decisionDate в месяце). */
  orderedAmount: number;
  /** Оплачено фабрикам (Σ FactoryPayout.amount за месяц, deletedAt=null). */
  paidToFactories: number;
  /** Товар в пути на сумму (Σ заказов в статусе IN_TRANSIT сейчас). */
  inTransitAmount: number;
  /** Платежи следующего месяца по графику (Σ незакрытых Payment.plannedDate). */
  nextMonthPayments: number;
};

export type StatsPage = {
  yearMonth: number;
  /** Тренд за выбранный период (6 или 12 месяцев по возрастанию). */
  trend: TrendMonth[];
  compare: MonthCompare;
  people: PersonRow[];
  factories: FactoryRow[];
  money: ProductMoney;
  /** Список PM/владельцев для фильтра «Ответственный». */
  owners: Array<{ id: string; name: string }>;
};

// ── Утилиты ──────────────────────────────────────────────────────────────

const MONTH_SHORT_RU = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

/** Короткая подпись месяца по YYYYMM: «янв», «фев» … */
export function shortMonthLabel(yearMonth: number): string {
  return MONTH_SHORT_RU[(yearMonth % 100) - 1] ?? "?";
}

/** Сдвиг YYYYMM на delta месяцев. */
export function shiftYm(yearMonth: number, delta: number): number {
  const year = Math.floor(yearMonth / 100);
  const month = (yearMonth % 100) - 1 + delta;
  const d = new Date(Date.UTC(year, month, 1));
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}

/** Медиана массива чисел. Пустой массив → null. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Целых суток между двумя датами (b − a), округление вниз. */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

// Заказ считается «в пути сейчас» для стоимости товара в пути.
const IN_TRANSIT: OrderStatus = "IN_TRANSIT";

/**
 * Сумма заказа = Σ стоимости позиций.
 * Приоритет как на странице заказа: batchCost позиции → snapshotFullCost×qty →
 * себестоимость фасона (resolveModelCost) × qty. Так число совпадает с /orders.
 */
export function orderTotalCost(
  lines: Array<{ batchCost: unknown; snapshotFullCost: unknown; quantity: number }>,
  model: ModelCostInput,
): number {
  const modelCost = resolveModelCost(model) ?? 0;
  return lines.reduce((sum, l) => {
    const lc = Number(l.batchCost ?? 0);
    if (lc > 0) return sum + lc;
    const snap = Number(l.snapshotFullCost ?? 0);
    if (snap > 0) return sum + snap * l.quantity;
    return sum + modelCost * l.quantity;
  }, 0);
}

// Поля фасона для resolveModelCost — единый select.
const MODEL_COST_SELECT = {
  fullCost: true,
  purchasePriceRub: true,
  purchasePriceCny: true,
  cnyRubRate: true,
  targetCostRub: true,
  targetCostCny: true,
} as const;

// ── Строка заказа для расчётов (после select) ─────────────────────────────
type OrderRow = {
  productModelId: string;
  ownerId: string;
  factoryId: string | null;
  status: OrderStatus;
  decisionDate: Date | null;
  qcDate: Date | null;
  readyAtFactoryDate: Date | null;
  arrivalActualDate: Date | null;
  arrivalPlannedDate: Date | null;
  owner: { name: string | null; role: string | null } | null;
  factory: { name: string | null } | null;
  productModel: ModelCostInput;
  lines: { quantity: number; batchCost: unknown; snapshotFullCost: unknown }[];
  statusLogs: { toStatus: OrderStatus; changedAt: Date }[];
};

/** «Заказано в месяце M»: decisionDate в [start, next). */
function orderedInMonth(o: OrderRow, start: Date, next: Date): boolean {
  return inMonth(o.decisionDate, start, next);
}

/** «Получено в месяце M»: arrivalActualDate в M И статус ≥ WAREHOUSE_MSK. */
function receivedInMonth(o: OrderRow, start: Date, next: Date): boolean {
  return inMonth(o.arrivalActualDate, start, next) && statusAtLeast(o.status, "WAREHOUSE_MSK");
}

/** Штук в заказе (план — OrderLine.quantity). */
function orderUnits(o: OrderRow): number {
  return o.lines.reduce((s, l) => s + l.quantity, 0);
}

// ── Основной расчёт ────────────────────────────────────────────────────────

export async function getStatsPage(opts?: {
  requestedYm?: number;
  /** Кол-во месяцев тренда (6 или 12). */
  trendMonths?: 6 | 12;
  /** Фильтр по ответственному (ownerId). null/undefined — вся команда. */
  ownerId?: string | null;
}): Promise<StatsPage> {
  const current = moscowMonth();
  const yearMonth = opts?.requestedYm && opts.requestedYm <= current ? opts.requestedYm : current;
  const trendMonths = opts?.trendMonths === 12 ? 12 : 6;
  const ownerFilter = opts?.ownerId ?? null;

  // Границы: самый ранний месяц тренда … начало следующего за текущим месяца.
  const firstTrendYm = shiftYm(yearMonth, -(trendMonths - 1));
  const rangeStart = monthBounds(firstTrendYm).start;
  const nextMonthYm = shiftYm(yearMonth, 1);
  const rangeEnd = monthBounds(nextMonthYm).next; // до конца следующего месяца — для платежей след. месяца

  // Границы выбранного и прошлого месяца.
  const cur = monthBounds(yearMonth);
  const prev = monthBounds(shiftYm(yearMonth, -1));
  const nextM = monthBounds(nextMonthYm);

  // ── Запросы (минимум, всё остальное — в JS) ──────────────────────────────
  const [orders, payouts, plans, nextPayments, ownersList] = await Promise.all([
    // Заказы, релевантные периоду тренда/сравнения ИЛИ активные (для «в пути»).
    prisma.order.findMany({
      where: {
        deletedAt: null,
        ...(ownerFilter ? { ownerId: ownerFilter } : {}),
        OR: [
          { decisionDate: { gte: rangeStart, lt: rangeEnd } },
          { arrivalActualDate: { gte: rangeStart, lt: rangeEnd } },
          { qcDate: { gte: rangeStart, lt: rangeEnd } },
          { readyAtFactoryDate: { gte: rangeStart, lt: rangeEnd } },
          { status: IN_TRANSIT },
          { statusLogs: { some: { toStatus: "IN_TRANSIT", changedAt: { gte: rangeStart, lt: rangeEnd } } } },
        ],
      },
      select: {
        productModelId: true,
        ownerId: true,
        factoryId: true,
        status: true,
        decisionDate: true,
        qcDate: true,
        readyAtFactoryDate: true,
        arrivalActualDate: true,
        arrivalPlannedDate: true,
        owner: { select: { name: true, role: true } },
        factory: { select: { name: true } },
        productModel: { select: MODEL_COST_SELECT },
        lines: { select: { quantity: true, batchCost: true, snapshotFullCost: true } },
        statusLogs: {
          where: { toStatus: "IN_TRANSIT" },
          select: { toStatus: true, changedAt: true },
        },
      },
    }),
    // Оплаты фабрикам за выбранный месяц (deletedAt=null).
    prisma.factoryPayout.findMany({
      where: { deletedAt: null, date: { gte: cur.start, lt: cur.next } },
      select: { amount: true },
    }),
    // Планы выбранного месяца — по людям (как в team-month-stats).
    prisma.monthlyPlan.findMany({
      where: { yearMonth, ownerId: { not: null } },
      select: {
        ownerId: true,
        plannedModelCount: true,
        plannedQuantity: true,
        owner: { select: { role: true } },
      },
    }),
    // Незакрытые платежи по графику на СЛЕДУЮЩИЙ месяц.
    prisma.payment.findMany({
      where: { status: "PENDING", plannedDate: { gte: nextM.start, lt: nextM.next } },
      select: { amount: true },
    }),
    // Полный список исполнителей для фильтра «Ответственный».
    prisma.user.findMany({
      where: { role: { in: ["PRODUCT_MANAGER", "OWNER", "DIRECTOR"] }, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = orders as unknown as OrderRow[];

  // ── a) ТРЕНД по месяцам ────────────────────────────────────────────────
  const trendYms: number[] = [];
  for (let i = trendMonths - 1; i >= 0; i--) trendYms.push(shiftYm(yearMonth, -i));

  const trend: TrendMonth[] = trendYms.map((ym) => {
    const b = monthBounds(ym);
    const acc = {
      ordered: { models: new Set<string>(), units: 0, money: 0 },
      received: { models: new Set<string>(), units: 0, money: 0 },
    };
    for (const o of rows) {
      const units = orderUnits(o);
      const cost = orderTotalCost(o.lines, o.productModel);
      if (orderedInMonth(o, b.start, b.next)) {
        acc.ordered.models.add(o.productModelId);
        acc.ordered.units += units;
        acc.ordered.money += cost;
      }
      if (receivedInMonth(o, b.start, b.next)) {
        acc.received.models.add(o.productModelId);
        acc.received.units += units;
        acc.received.money += cost;
      }
    }
    return {
      yearMonth: ym,
      label: shortMonthLabel(ym),
      ordered: { models: acc.ordered.models.size, units: acc.ordered.units, money: Math.round(acc.ordered.money) },
      received: { models: acc.received.models.size, units: acc.received.units, money: Math.round(acc.received.money) },
    };
  });

  // ── b) СРАВНЕНИЕ месяца с прошлым ──────────────────────────────────────
  const compare = buildCompare(rows, cur, prev);

  // ── c) ЛЮДИ за месяц ────────────────────────────────────────────────────
  const people = buildPeople(rows, plans, cur, prev);

  // ── d) ФАБРИКИ за месяц ─────────────────────────────────────────────────
  const factories = buildFactories(rows, cur);

  // ── e) ДЕНЬГИ продукта за месяц ─────────────────────────────────────────
  let orderedAmount = 0;
  let inTransitAmount = 0;
  for (const o of rows) {
    const cost = orderTotalCost(o.lines, o.productModel);
    if (orderedInMonth(o, cur.start, cur.next)) orderedAmount += cost;
    if (o.status === IN_TRANSIT) inTransitAmount += cost;
  }
  const money: ProductMoney = {
    orderedAmount: Math.round(orderedAmount),
    inTransitAmount: Math.round(inTransitAmount),
    paidToFactories: Math.round(payouts.reduce((s, p) => s + Number(p.amount), 0)),
    nextMonthPayments: Math.round(nextPayments.reduce((s, p) => s + Number(p.amount), 0)),
  };

  return {
    yearMonth,
    trend,
    compare,
    people,
    factories,
    money,
    owners: ownersList.map((u) => ({ id: u.id, name: u.name ?? "—" })),
  };
}

// ── Сравнение месяца ──────────────────────────────────────────────────────

type Bounds = { start: Date; next: Date };

/** Считает 4 метрики (заказано шт / получено шт / % вовремя / цикл) за один месяц. */
function monthMetrics(rows: OrderRow[], b: Bounds): {
  orderedUnits: number;
  receivedUnits: number;
  onTimePct: number;
  cycleDays: number;
} {
  let orderedUnits = 0;
  let receivedUnits = 0;
  let onTime = 0;
  let onTimeBase = 0; // прибывшие, у которых есть плановая дата
  const cycles: number[] = [];
  for (const o of rows) {
    if (orderedInMonth(o, b.start, b.next)) orderedUnits += orderUnits(o);
    if (receivedInMonth(o, b.start, b.next)) {
      receivedUnits += orderUnits(o);
      // % вовремя — только если есть плановая дата прибытия.
      if (o.arrivalPlannedDate && o.arrivalActualDate) {
        onTimeBase += 1;
        if (o.arrivalActualDate.getTime() <= o.arrivalPlannedDate.getTime()) onTime += 1;
      }
      // Цикл = actual − decision (в днях).
      if (o.arrivalActualDate && o.decisionDate) {
        cycles.push(daysBetween(o.decisionDate, o.arrivalActualDate));
      }
    }
  }
  return {
    orderedUnits,
    receivedUnits,
    onTimePct: onTimeBase > 0 ? Math.round((onTime / onTimeBase) * 100) : 0,
    cycleDays: Math.round(median(cycles) ?? 0),
  };
}

function buildCompare(rows: OrderRow[], cur: Bounds, prev: Bounds): MonthCompare {
  const c = monthMetrics(rows, cur);
  const p = monthMetrics(rows, prev);
  return {
    orderedUnits: { value: c.orderedUnits, prev: p.orderedUnits },
    receivedUnits: { value: c.receivedUnits, prev: p.receivedUnits },
    onTimePct: { value: c.onTimePct, prev: p.onTimePct },
    cycleDays: { value: c.cycleDays, prev: p.cycleDays },
  };
}

// ── Люди ────────────────────────────────────────────────────────────────

function buildPeople(
  rows: OrderRow[],
  plans: Array<{ ownerId: string | null; plannedModelCount: number | null; plannedQuantity: number | null; owner: { role: string | null } | null }>,
  cur: Bounds,
  prev: Bounds,
): PersonRow[] {
  type Acc = {
    ownerId: string;
    ownerName: string;
    role: string | null;
    factModels: Set<string>;
    factUnits: number;
    onTime: number;
    onTimeBase: number;
    cycles: number[];
    cyclesPrev: number[];
    planModels: number | null;
    planUnits: number | null;
  };
  const map = new Map<string, Acc>();
  const ensure = (id: string, name: string | null, role: string | null): Acc => {
    let a = map.get(id);
    if (!a) {
      a = {
        ownerId: id, ownerName: name ?? "—", role,
        factModels: new Set(), factUnits: 0,
        onTime: 0, onTimeBase: 0, cycles: [], cyclesPrev: [],
        planModels: null, planUnits: null,
      };
      map.set(id, a);
    }
    return a;
  };

  for (const o of rows) {
    const a = ensure(o.ownerId, o.owner?.name ?? null, o.owner?.role ?? null);
    // Факт «заказано» в выбранном месяце (как в team-month-stats).
    if (orderedInMonth(o, cur.start, cur.next)) {
      a.factModels.add(o.productModelId);
      a.factUnits += orderUnits(o);
    }
    // Прибывшие в выбранном месяце — % вовремя и цикл.
    if (receivedInMonth(o, cur.start, cur.next)) {
      if (o.arrivalPlannedDate && o.arrivalActualDate) {
        a.onTimeBase += 1;
        if (o.arrivalActualDate.getTime() <= o.arrivalPlannedDate.getTime()) a.onTime += 1;
      }
      if (o.arrivalActualDate && o.decisionDate) a.cycles.push(daysBetween(o.decisionDate, o.arrivalActualDate));
    }
    // Прибывшие в прошлом месяце — только цикл (для дельты).
    if (receivedInMonth(o, prev.start, prev.next) && o.arrivalActualDate && o.decisionDate) {
      a.cyclesPrev.push(daysBetween(o.decisionDate, o.arrivalActualDate));
    }
  }

  // Планы (только PM). Заводим человека, даже если фактов у него не было.
  for (const p of plans) {
    if (!p.ownerId) continue;
    if (p.owner?.role !== "PRODUCT_MANAGER") continue;
    const a = ensure(p.ownerId, null, p.owner?.role ?? null);
    a.planModels = (a.planModels ?? 0) + (p.plannedModelCount ?? 0);
    a.planUnits = (a.planUnits ?? 0) + (p.plannedQuantity ?? 0);
  }

  return [...map.values()]
    .filter((a) => a.factUnits > 0 || a.factModels.size > 0 || a.cycles.length > 0 || (a.planUnits ?? 0) > 0 || (a.planModels ?? 0) > 0)
    .map((a) => ({
      ownerId: a.ownerId,
      ownerName: a.ownerName,
      factModels: a.factModels.size,
      planModels: a.planModels,
      factUnits: a.factUnits,
      planUnits: a.planUnits,
      onTimePct: a.onTimeBase > 0 ? Math.round((a.onTime / a.onTimeBase) * 100) : null,
      cycleDays: a.cycles.length > 0 ? Math.round(median(a.cycles) ?? 0) : null,
      cycleDaysPrev: a.cyclesPrev.length > 0 ? Math.round(median(a.cyclesPrev) ?? 0) : null,
    }))
    .sort((a, b) => b.factUnits - a.factUnits || b.factModels - a.factModels);
}

// ── Фабрики ───────────────────────────────────────────────────────────────

function buildFactories(rows: OrderRow[], cur: Bounds): FactoryRow[] {
  type Acc = {
    factoryId: string;
    factoryName: string;
    orderedUnits: number;
    receivedUnits: number;
    arrivedOrders: number;
    lateDaysSum: number;
    lateBase: number;
  };
  const map = new Map<string, Acc>();
  const ensure = (id: string, name: string | null): Acc => {
    let a = map.get(id);
    if (!a) {
      a = { factoryId: id, factoryName: name ?? "—", orderedUnits: 0, receivedUnits: 0, arrivedOrders: 0, lateDaysSum: 0, lateBase: 0 };
      map.set(id, a);
    }
    return a;
  };

  for (const o of rows) {
    if (!o.factoryId) continue; // без фабрики — не считаем в разрезе фабрик
    const a = ensure(o.factoryId, o.factory?.name ?? null);
    if (orderedInMonth(o, cur.start, cur.next)) a.orderedUnits += orderUnits(o);
    if (receivedInMonth(o, cur.start, cur.next)) {
      a.receivedUnits += orderUnits(o);
      a.arrivedOrders += 1;
      // Ср. опоздание — только по прибывшим с плановой датой.
      if (o.arrivalPlannedDate && o.arrivalActualDate) {
        a.lateBase += 1;
        a.lateDaysSum += Math.max(0, daysBetween(o.arrivalPlannedDate, o.arrivalActualDate));
      }
    }
  }

  return [...map.values()]
    .filter((a) => a.orderedUnits > 0 || a.receivedUnits > 0)
    .map((a) => ({
      factoryId: a.factoryId,
      factoryName: a.factoryName,
      orderedUnits: a.orderedUnits,
      receivedUnits: a.receivedUnits,
      arrivedOrders: a.arrivedOrders,
      avgLateDays: a.lateBase > 0 ? Math.round(a.lateDaysSum / a.lateBase) : 0,
    }))
    .sort((a, b) => b.orderedUnits + b.receivedUnits - (a.orderedUnits + a.receivedUnits));
}
