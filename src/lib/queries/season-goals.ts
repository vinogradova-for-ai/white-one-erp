import { prisma } from "@/lib/prisma";
import { MONTHLY_GOAL, SEASONS, matchSeasonCategory, type Season } from "@/lib/seasons";
import { isOrderLaunched } from "@/lib/order-stage";

/**
 * Сезонные цели + фактическое исполнение.
 * План = сумма MonthlyPlan по месяцам сезона.
 * Факт = заказы с launchMonth внутри сезона: distinct productModelId для
 * «новых артикулов» (фасонов), sum(OrderLine.quantity) для «штук».
 *
 * KPI по PM считается из того же набора, разбиваясь по ownerId.
 * KPI по категориям — нечёткое совпадение matchSeasonCategory.
 * Заторы = ProductModel.plannedLaunchMonth ∈ сезон, но status ещё не «в производстве»
 *   ИЛИ Order.launchMonth ∈ сезон с просрочкой фазы.
 */

export type SeasonOverview = {
  season: Season;
  /** Цели сезона (по умолчанию 10 артикулов и 20 000 шт × число месяцев) */
  goalModels: number;
  goalQuantity: number;
  /** План по сезону (сумма по MonthlyPlan месяцев сезона, без category-сводки) */
  plannedModels: number;
  plannedQuantity: number;
  /** Факт: distinct productModelId с launchMonth ∈ сезон; sum quantity */
  factModels: number;
  factQuantity: number;
  /** Раскладка по месяцам */
  monthly: Array<{
    yearMonth: number;
    label: string;
    plannedModels: number;
    plannedQuantity: number;
    factModels: number;
    factQuantity: number;
    loadStatus: "ok" | "underplan" | "overload" | "gap" | "future";
  }>;
  /** Раскладка по PM (ownerId) */
  byOwner: Array<{
    ownerId: string | null;
    ownerName: string;
    plannedModels: number;
    plannedQuantity: number;
    factModels: number;
    factQuantity: number;
  }>;
  /** Раскладка по категориям сезона (8 категорий Алёны) */
  byCategory: Array<{
    category: string;
    plannedModels: number;
    factModels: number;
    factQuantity: number;
  }>;
  /** Заторы: артикулы которые планировались на этот сезон, но не успеют */
  blockers: Array<{
    kind: "model-not-launched" | "order-stuck";
    modelId: string;
    modelName: string;
    ownerName: string;
    text: string;
  }>;
};

const MONTH_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export async function getSeasonOverview(seasonKey: string): Promise<SeasonOverview | null> {
  const season = SEASONS.find((s) => s.key === seasonKey);
  if (!season) return null;

  const months = season.months;
  const minYm = Math.min(...months);
  const maxYm = Math.max(...months);

  const [plans, orders, modelsForBlockers, today] = await Promise.all([
    prisma.monthlyPlan.findMany({
      where: { yearMonth: { in: months } },
      include: { owner: { select: { id: true, name: true } } },
    }),
    prisma.order.findMany({
      where: {
        deletedAt: null,
        launchMonth: { in: months },
      },
      include: {
        owner: { select: { id: true, name: true } },
        productModel: { select: { id: true, name: true, category: true } },
        lines: { select: { quantity: true } },
      },
    }),
    // Для заторов: фасоны с plannedLaunchMonth в сезоне, ещё не запущенные.
    prisma.productModel.findMany({
      where: {
        deletedAt: null,
        activated: true,
        plannedLaunchMonth: { in: months },
        status: { notIn: ["IN_PRODUCTION"] },
      },
      include: {
        owner: { select: { name: true } },
        orders: { where: { deletedAt: null }, select: { status: true } },
      },
    }),
    Promise.resolve(new Date()),
  ]);

  // «Факт выпуска» = только РЕАЛЬНО запущенные заказы (пошив начался и дальше).
  // Заказы в PREPARATION/FABRIC_ORDERED считаются заторами, а не выпуском —
  // иначе прогресс к цели завышается незапущенными заказами (аудит блок ④).
  // Полный `orders` оставляем для секции «Заторы» ниже.
  const launchedOrders = orders.filter((o) => isOrderLaunched(o.status));

  // ── Голы и план/факт по сезону ───────────────────────────────────
  const goalModels = MONTHLY_GOAL.models * months.length;
  const goalQuantity = MONTHLY_GOAL.quantity * months.length;
  const plannedModels = plans.reduce((s, p) => s + (p.plannedModelCount ?? 0), 0);
  const plannedQuantity = plans.reduce((s, p) => s + (p.plannedQuantity ?? 0), 0);

  const uniqueFactModelIds = new Set<string>();
  let factQuantity = 0;
  for (const o of launchedOrders) {
    uniqueFactModelIds.add(o.productModelId);
    for (const l of o.lines) factQuantity += l.quantity;
  }
  const factModels = uniqueFactModelIds.size;

  // ── По месяцам ───────────────────────────────────────────────────
  const monthly = months.map((ym) => {
    const monthPlans = plans.filter((p) => p.yearMonth === ym);
    const monthOrders = launchedOrders.filter((o) => o.launchMonth === ym);
    const monthFactModels = new Set(monthOrders.map((o) => o.productModelId)).size;
    const monthFactQty = monthOrders.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.quantity, 0), 0);
    const pM = monthPlans.reduce((s, p) => s + (p.plannedModelCount ?? 0), 0);
    const pQ = monthPlans.reduce((s, p) => s + (p.plannedQuantity ?? 0), 0);
    // loadStatus: будущий месяц — future, текущий/прошлый: сравнение факта с планом.
    const m = Math.floor(ym / 100) * 100 + (ym % 100);
    const todayYm = today.getFullYear() * 100 + (today.getMonth() + 1);
    const isFuture = m > todayYm;
    let loadStatus: "ok" | "underplan" | "overload" | "gap" | "future" = "future";
    if (!isFuture) {
      if (pM === 0 && pQ === 0) loadStatus = "gap";
      else if (pQ > 0 && monthFactQty / pQ >= 0.9) loadStatus = "ok";
      else if (pQ > 0 && monthFactQty / pQ >= 0.5) loadStatus = "underplan";
      else loadStatus = "overload"; // план есть, факт сильно ниже
    } else {
      // Будущий месяц: только смотрим есть ли план вообще.
      if (pM === 0 && pQ === 0) loadStatus = "gap";
      else loadStatus = "future";
    }
    return {
      yearMonth: ym,
      label: `${MONTH_RU[(ym % 100) - 1]} ${Math.floor(ym / 100)}`,
      plannedModels: pM,
      plannedQuantity: pQ,
      factModels: monthFactModels,
      factQuantity: monthFactQty,
      loadStatus,
    };
  });

  // ── По PM (ownerId) ──────────────────────────────────────────────
  const ownerMap = new Map<string, {
    ownerId: string | null;
    ownerName: string;
    plannedModels: number;
    plannedQuantity: number;
    factModelIds: Set<string>;
    factQuantity: number;
  }>();
  function ensureOwner(id: string | null, name: string) {
    const key = id ?? "_none";
    if (!ownerMap.has(key)) {
      ownerMap.set(key, {
        ownerId: id,
        ownerName: name,
        plannedModels: 0,
        plannedQuantity: 0,
        factModelIds: new Set(),
        factQuantity: 0,
      });
    }
    return ownerMap.get(key)!;
  }
  for (const p of plans) {
    const o = ensureOwner(p.ownerId, p.owner?.name ?? (p.ownerId ? "—" : "Без ответственного"));
    o.plannedModels += p.plannedModelCount ?? 0;
    o.plannedQuantity += p.plannedQuantity ?? 0;
  }
  for (const o of launchedOrders) {
    const own = ensureOwner(o.ownerId, o.owner?.name ?? (o.ownerId ? "—" : "Без ответственного"));
    own.factModelIds.add(o.productModelId);
    own.factQuantity += o.lines.reduce((s, l) => s + l.quantity, 0);
  }
  const byOwner = [...ownerMap.values()]
    .map((o) => ({
      ownerId: o.ownerId,
      ownerName: o.ownerName,
      plannedModels: o.plannedModels,
      plannedQuantity: o.plannedQuantity,
      factModels: o.factModelIds.size,
      factQuantity: o.factQuantity,
    }))
    .sort((a, b) => a.ownerName.localeCompare(b.ownerName));

  // ── По категориям сезона ────────────────────────────────────────
  const byCategory = season.categories.map((cat) => {
    const catPlans = plans.filter((p) => p.category && matchSeasonCategory(p.category, cat, season.categories));
    const catOrders = launchedOrders.filter((o) => matchSeasonCategory(o.productModel.category, cat, season.categories));
    return {
      category: cat,
      plannedModels: catPlans.reduce((s, p) => s + (p.plannedModelCount ?? 0), 0),
      factModels: new Set(catOrders.map((o) => o.productModelId)).size,
      factQuantity: catOrders.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.quantity, 0), 0),
    };
  });

  // ── Заторы ───────────────────────────────────────────────────────
  // 1. Фасоны с plannedLaunchMonth в сезоне, не запущенные в производство.
  // 2. Заказы с launchMonth в сезоне в нездоровых статусах (PREPARATION при < 30 дн до месяца запуска).
  const blockers: SeasonOverview["blockers"] = [];
  for (const m of modelsForBlockers) {
    blockers.push({
      kind: "model-not-launched",
      modelId: m.id,
      modelName: m.name,
      ownerName: m.owner?.name ?? "—",
      text: `Фасон в сезоне, но не в производстве (status: ${m.status})`,
    });
  }
  // Заказы — где launchMonth уже близко (≤30 дн) или прошёл, а статус не дошёл до IN_TRANSIT/WAREHOUSE_MSK.
  const STUCK_STATUSES = new Set(["PREPARATION", "FABRIC_ORDERED"]);
  for (const o of orders) {
    if (!STUCK_STATUSES.has(o.status)) continue;
    const targetDate = new Date(Date.UTC(Math.floor(o.launchMonth! / 100), (o.launchMonth! % 100) - 1, 1));
    const daysLeft = Math.round((targetDate.getTime() - today.getTime()) / 86_400_000);
    if (daysLeft <= 45) {
      blockers.push({
        kind: "order-stuck",
        modelId: o.productModelId,
        modelName: `${o.orderNumber} · ${o.productModel.name}`,
        ownerName: o.owner?.name ?? "—",
        text: daysLeft < 0
          ? `Месяц запуска прошёл ${-daysLeft} дн назад, заказ в «${o.status}»`
          : `До месяца запуска ${daysLeft} дн, заказ всё ещё «${o.status}»`,
      });
    }
  }

  void minYm; void maxYm;

  return {
    season,
    goalModels,
    goalQuantity,
    plannedModels,
    plannedQuantity,
    factModels,
    factQuantity,
    monthly,
    byOwner,
    byCategory,
    blockers,
  };
}

/**
 * Сводка всех сезонов сразу — для табов и общего обзора «весь год».
 */
export async function getAllSeasonsSummary(): Promise<Array<{
  season: Season;
  goalModels: number;
  goalQuantity: number;
  plannedModels: number;
  plannedQuantity: number;
  factModels: number;
  factQuantity: number;
}>> {
  const allMonths = SEASONS.flatMap((s) => s.months);
  const [plans, orders] = await Promise.all([
    prisma.monthlyPlan.findMany({
      where: { yearMonth: { in: allMonths } },
    }),
    prisma.order.findMany({
      where: { deletedAt: null, launchMonth: { in: allMonths } },
      select: { launchMonth: true, productModelId: true, lines: { select: { quantity: true } } },
    }),
  ]);
  return SEASONS.map((s) => {
    const sPlans = plans.filter((p) => s.months.includes(p.yearMonth));
    const sOrders = orders.filter((o) => o.launchMonth && s.months.includes(o.launchMonth));
    return {
      season: s,
      goalModels: 10 * s.months.length,
      goalQuantity: 20_000 * s.months.length,
      plannedModels: sPlans.reduce((acc, p) => acc + (p.plannedModelCount ?? 0), 0),
      plannedQuantity: sPlans.reduce((acc, p) => acc + (p.plannedQuantity ?? 0), 0),
      factModels: new Set(sOrders.map((o) => o.productModelId)).size,
      factQuantity: sOrders.reduce((acc, o) => acc + o.lines.reduce((a, l) => a + l.quantity, 0), 0),
    };
  });
}
