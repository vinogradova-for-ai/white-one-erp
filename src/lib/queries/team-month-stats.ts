import type { OrderStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_VALUES } from "@/lib/order-stage";

/**
 * Продуктивность команды за месяц — блок «Команда в месяце» на дашборде.
 *
 * По каждому владельцу (ownerId заказов/фасонов) за месяц M (по МСК) считаем
 * четыре свершившихся факта: заказано / проверено / отправлено / получено —
 * в фасонах (distinct productModelId) и штуках (сумма OrderLine.quantity).
 *
 * ЗАКОН ЧЕСТНОСТИ (аудит): считаем ТОЛЬКО свершившееся. Никаких «плановая дата
 * прошла → засчитано». Этап засчитывается, только если заказ реально дошёл до
 * соответствующего статуса (или дальше по циклу).
 *
 * Плюс «нагрузка сейчас» (не зависит от месяца) — активные заказы + фасоны в
 * разработке; и план месяца из MonthlyPlan (только у PM, у OWNER/DIRECTOR нет).
 *
 * Запросы: один по заказам (с линиями и лог-переходами), один по фасонам в
 * разработке, один по планам. Вся группировка — в JS, без N+1.
 */

// ── Ранг статуса на общей ленте цикла ────────────────────────────────
// Индекс в каноническом порядке статусов. Чем больше — тем дальше по циклу.
const STATUS_RANK: Record<OrderStatus, number> = Object.fromEntries(
  ORDER_STATUS_VALUES.map((s, i) => [s, i]),
) as Record<OrderStatus, number>;

/** Статус заказа ≥ порогового по каноническому порядку цикла. */
export function statusAtLeast(status: OrderStatus, threshold: OrderStatus): boolean {
  return STATUS_RANK[status] >= STATUS_RANK[threshold];
}

// Активные заказы для «нагрузки сейчас»: от подготовки до доставки включительно
// (не завершённые — WAREHOUSE_MSK и дальше уже на складе/в продаже).
const ACTIVE_STATUSES: OrderStatus[] = [
  "PREPARATION",
  "FABRIC_ORDERED",
  "SEWING",
  "QC",
  "READY_SHIP",
  "IN_TRANSIT",
];

// Фасоны «в разработке» — до запуска в производство.
const DEV_MODEL_STATUSES = ["IDEA", "PATTERNS", "SAMPLE", "APPROVED"] as const;

// У кого показываем бары плана: только продакты (PM). У OWNER/DIRECTOR плана нет.
const PLAN_ROLES: Role[] = ["PRODUCT_MANAGER"];

// ── Типы ──────────────────────────────────────────────────────────────
export type StageTotals = {
  /** distinct фасонов (productModelId) */
  models: number;
  /** сумма штук (OrderLine.quantity) */
  units: number;
};

export type OwnerMonthStats = {
  ownerId: string;
  ownerName: string;
  role: Role | null;
  ordered: StageTotals;
  checked: StageTotals;
  shipped: StageTotals;
  received: StageTotals;
  /** Нагрузка сейчас: активные заказы владельца. */
  activeLoad: StageTotals;
  /** Фасонов в разработке без живого заказа. */
  devModels: number;
  /** План месяца (только у PM). null — плана нет / роль без плана. */
  plan: { models: number; units: number } | null;
};

export type TeamMonthStats = {
  /** YYYYMM выбранного месяца. */
  yearMonth: number;
  /** true — можно листать вперёд (месяц раньше текущего). */
  canGoForward: boolean;
  owners: OwnerMonthStats[];
  /** Командные итоги по 4 этапам (сумма по людям). */
  totals: {
    ordered: StageTotals;
    checked: StageTotals;
    shipped: StageTotals;
    received: StageTotals;
  };
};

// ── Утилиты дат (МСК) ──────────────────────────────────────────────────

/** Текущий месяц по МСК в формате YYYYMM. */
export function moscowMonth(now: Date = new Date()): number {
  const msk = new Date(now.getTime() + (3 * 60 - now.getTimezoneOffset()) * 60_000);
  return msk.getUTCFullYear() * 100 + (msk.getUTCMonth() + 1);
}

/** Границы месяца [start, next) в UTC для YYYYMM, интерпретируя календарь по МСК. */
export function monthBounds(yearMonth: number): { start: Date; next: Date } {
  const year = Math.floor(yearMonth / 100);
  const month = (yearMonth % 100) - 1; // 0-based
  // Полночь МСК = 21:00 UTC предыдущих суток. Даты в БД лежат в UTC; чтобы месяц
  // «по МСК» совпадал с ощущением Алёны, сдвигаем границы на -3 часа.
  const start = new Date(Date.UTC(year, month, 1, -3, 0, 0));
  const next = new Date(Date.UTC(year, month + 1, 1, -3, 0, 0));
  return { start, next };
}

/** Дата попадает в [start, next). null — не попадает. */
export function inMonth(date: Date | null | undefined, start: Date, next: Date): boolean {
  if (!date) return false;
  const t = date.getTime();
  return t >= start.getTime() && t < next.getTime();
}

/** Нормализация yearMonth: не даём листать вперёд текущего месяца. */
export function clampMonth(requested: number | null | undefined, current: number): number {
  if (!requested || !Number.isFinite(requested)) return current;
  return requested > current ? current : requested;
}

// ── Расчёт «отправлено» ─────────────────────────────────────────────────
// Заказ считается отправленным в месяце M, если он вошёл в доставку в M.
// Основной сигнал — переход в IN_TRANSIT по OrderStatusLog внутри M.
// Fallback для старых данных (лога может не быть): qcDate (или readyAtFactoryDate)
// в M И статус реально ≥ IN_TRANSIT.
export function shippedInMonth(
  order: {
    status: OrderStatus;
    qcDate: Date | null;
    readyAtFactoryDate: Date | null;
    statusLogs: { toStatus: OrderStatus; changedAt: Date }[];
    // Партии заказа с датой выезда их поставки — доп. сигнал «отправлено».
    batches?: { shipment: { departDate: Date | null } | null }[];
  },
  start: Date,
  next: Date,
): boolean {
  // 1) Основной путь — лог перехода в IN_TRANSIT в этом месяце.
  const wentInTransit = order.statusLogs.some(
    (l) => l.toStatus === "IN_TRANSIT" && inMonth(l.changedAt, start, next),
  );
  if (wentInTransit) return true;

  // 1b) Доп. сигнал: партия заказа уехала в поставке (departDate) в этом месяце.
  const departed = order.batches?.some((b) => inMonth(b.shipment?.departDate ?? null, start, next));
  if (departed) return true;

  // 2) Fallback: лога нет (старые заказы), но статус уже ≥ IN_TRANSIT и есть
  //    датированный факт «готово к отправке» в этом месяце.
  if (!statusAtLeast(order.status, "IN_TRANSIT")) return false;
  const hasLog = order.statusLogs.some((l) => l.toStatus === "IN_TRANSIT");
  if (hasLog) return false; // лог есть, но не в этом месяце → в этом месяце не отправляли
  // Заказ прошёл ОТК → берём qcDate; без ОТК — readyAtFactoryDate.
  const anchor = order.qcDate ?? order.readyAtFactoryDate;
  return inMonth(anchor, start, next);
}

// ── Основной запрос ─────────────────────────────────────────────────────

export async function getTeamMonthStats(requestedYm?: number): Promise<TeamMonthStats> {
  const current = moscowMonth();
  const yearMonth = clampMonth(requestedYm, current);
  const { start, next } = monthBounds(yearMonth);

  const [orders, devModels, plans] = await Promise.all([
    // Все заказы, которые могли что-то дать в этом месяце ИЛИ активны сейчас.
    // Тянем широко и фильтруем по фактам в JS — так один запрос покрывает все
    // четыре этапа + нагрузку, без N+1.
    prisma.order.findMany({
      where: {
        deletedAt: null,
        OR: [
          { decisionDate: { gte: start, lt: next } },
          { qcDate: { gte: start, lt: next } },
          { readyAtFactoryDate: { gte: start, lt: next } },
          { arrivalActualDate: { gte: start, lt: next } },
          { status: { in: ACTIVE_STATUSES } },
          { statusLogs: { some: { toStatus: "IN_TRANSIT", changedAt: { gte: start, lt: next } } } },
          // Партия заказа принята в этом месяце (доп. сигнал «получено»).
          { batches: { some: { receivedAt: { gte: start, lt: next } } } },
          // Поставка партии заказа выехала в этом месяце (доп. сигнал «отправлено»).
          { batches: { some: { shipment: { departDate: { gte: start, lt: next } } } } },
        ],
      },
      select: {
        productModelId: true,
        ownerId: true,
        status: true,
        decisionDate: true,
        qcDate: true,
        readyAtFactoryDate: true,
        arrivalActualDate: true,
        owner: { select: { name: true, role: true } },
        lines: { select: { quantity: true } },
        statusLogs: {
          where: { toStatus: "IN_TRANSIT" },
          select: { toStatus: true, changedAt: true },
        },
        // Партии + даты приёмки/выезда поставки — доп. сигналы «отправлено»/«получено».
        batches: {
          select: {
            receivedAt: true,
            shipment: { select: { departDate: true } },
          },
        },
      },
    }),
    // Фасоны в разработке без живого заказа — «+N в разработке».
    prisma.productModel.findMany({
      where: {
        deletedAt: null,
        activated: true,
        status: { in: [...DEV_MODEL_STATUSES] },
        orders: { none: { deletedAt: null } },
      },
      select: { ownerId: true, owner: { select: { name: true, role: true } } },
    }),
    // План месяца — только строки с ownerId (общие/категорийные не привязываем к людям).
    prisma.monthlyPlan.findMany({
      where: { yearMonth, ownerId: { not: null } },
      select: {
        ownerId: true,
        plannedModelCount: true,
        plannedQuantity: true,
        owner: { select: { name: true, role: true } },
      },
    }),
  ]);

  // ── Агрегация по владельцам ──────────────────────────────────────────
  type Acc = {
    ownerId: string;
    ownerName: string;
    role: Role | null;
    orderedModels: Set<string>;
    orderedUnits: number;
    checkedModels: Set<string>;
    checkedUnits: number;
    shippedModels: Set<string>;
    shippedUnits: number;
    receivedModels: Set<string>;
    receivedUnits: number;
    activeModels: Set<string>;
    activeUnits: number;
    devModels: number;
    plan: { models: number; units: number } | null;
  };
  const map = new Map<string, Acc>();
  function ensure(ownerId: string, name: string | undefined, role: Role | null): Acc {
    let a = map.get(ownerId);
    if (!a) {
      a = {
        ownerId,
        ownerName: name ?? "—",
        role,
        orderedModels: new Set(),
        orderedUnits: 0,
        checkedModels: new Set(),
        checkedUnits: 0,
        shippedModels: new Set(),
        shippedUnits: 0,
        receivedModels: new Set(),
        receivedUnits: 0,
        activeModels: new Set(),
        activeUnits: 0,
        devModels: 0,
        plan: null,
      };
      map.set(ownerId, a);
    }
    return a;
  }

  for (const o of orders) {
    const acc = ensure(o.ownerId, o.owner?.name, o.owner?.role ?? null);
    const units = o.lines.reduce((s, l) => s + l.quantity, 0);

    // Заказано: decisionDate в M.
    if (inMonth(o.decisionDate, start, next)) {
      acc.orderedModels.add(o.productModelId);
      acc.orderedUnits += units;
    }
    // Проверено: qcDate в M И заказ реально прошёл ОТК (≥ READY_SHIP).
    if (inMonth(o.qcDate, start, next) && statusAtLeast(o.status, "READY_SHIP")) {
      acc.checkedModels.add(o.productModelId);
      acc.checkedUnits += units;
    }
    // Отправлено: вошёл в доставку в M (лог IN_TRANSIT или fallback).
    if (shippedInMonth(o, start, next)) {
      acc.shippedModels.add(o.productModelId);
      acc.shippedUnits += units;
    }
    // Получено: arrivalActualDate в M И статус ≥ WAREHOUSE_MSK (основной путь),
    // ЛИБО доп. сигнал — партия заказа принята (receivedAt) в этом месяце.
    const arrivedByOrder = inMonth(o.arrivalActualDate, start, next) && statusAtLeast(o.status, "WAREHOUSE_MSK");
    const batchReceived = o.batches.some((b) => inMonth(b.receivedAt, start, next));
    if (arrivedByOrder || batchReceived) {
      acc.receivedModels.add(o.productModelId);
      acc.receivedUnits += units;
    }
    // Нагрузка сейчас: активный заказ (не зависит от месяца).
    if (ACTIVE_STATUSES.includes(o.status)) {
      acc.activeModels.add(o.productModelId);
      acc.activeUnits += units;
    }
  }

  for (const m of devModels) {
    const acc = ensure(m.ownerId, m.owner?.name, m.owner?.role ?? null);
    acc.devModels += 1;
  }

  for (const p of plans) {
    if (!p.ownerId) continue;
    const role = p.owner?.role ?? null;
    if (!role || !PLAN_ROLES.includes(role)) continue; // план показываем только PM
    const acc = ensure(p.ownerId, p.owner?.name, role);
    const prev = acc.plan ?? { models: 0, units: 0 };
    acc.plan = {
      models: prev.models + (p.plannedModelCount ?? 0),
      units: prev.units + (p.plannedQuantity ?? 0),
    };
  }

  const owners: OwnerMonthStats[] = [...map.values()]
    .map((a) => ({
      ownerId: a.ownerId,
      ownerName: a.ownerName,
      role: a.role,
      ordered: { models: a.orderedModels.size, units: a.orderedUnits },
      checked: { models: a.checkedModels.size, units: a.checkedUnits },
      shipped: { models: a.shippedModels.size, units: a.shippedUnits },
      received: { models: a.receivedModels.size, units: a.receivedUnits },
      activeLoad: { models: a.activeModels.size, units: a.activeUnits },
      devModels: a.devModels,
      plan: a.plan,
    }))
    // Люди без активности в месяце И без нагрузки/разработки — не показываем.
    .filter(
      (o) =>
        o.ordered.units > 0 ||
        o.checked.units > 0 ||
        o.shipped.units > 0 ||
        o.received.units > 0 ||
        o.activeLoad.units > 0 ||
        o.activeLoad.models > 0 ||
        o.devModels > 0,
    )
    // Сортировка по объёму заказанного (штуки, затем фасоны).
    .sort((a, b) => b.ordered.units - a.ordered.units || b.ordered.models - a.ordered.models);

  const totals = {
    ordered: sumStage(owners, "ordered"),
    checked: sumStage(owners, "checked"),
    shipped: sumStage(owners, "shipped"),
    received: sumStage(owners, "received"),
  };

  return {
    yearMonth,
    canGoForward: yearMonth < current,
    owners,
    totals,
  };
}

function sumStage(
  owners: OwnerMonthStats[],
  key: "ordered" | "checked" | "shipped" | "received",
): StageTotals {
  return owners.reduce(
    (acc, o) => ({ models: acc.models + o[key].models, units: acc.units + o[key].units }),
    { models: 0, units: 0 },
  );
}
