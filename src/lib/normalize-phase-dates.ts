// Нормализация таймлайнов: гарантирует, что фазы Разработка → Производство → ОТК
// → Доставка идут строго последовательно с разумными дефолтными длительностями.
// Не пересекаются, не параллельны. Если в БД дата уже стоит позже нашей расчётной —
// уважаем её (значит был запланирован больший срок).

const DEV_DAYS = 14;
const PROD_DAYS = 35;
const QC_DAYS = 5;
const SHIP_DAYS = 30;

const PACK_DEV_DAYS = 7;
const PACK_PROD_DAYS = 21;
const PACK_SHIP_DAYS = 14;

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setUTCHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

export type OrderDateFields = {
  decisionDate: Date | null;
  handedToFactoryDate: Date | null;
  readyAtFactoryDate: Date | null;
  qcDate: Date | null;
  arrivalPlannedDate: Date | null;
  createdAt: Date;
};

export type NormalizedOrderDates = {
  decisionDate: Date;
  handedToFactoryDate: Date;
  readyAtFactoryDate: Date;
  qcDate: Date;
  arrivalPlannedDate: Date;
};

export function normalizeOrderDates(o: OrderDateFields, today: Date = new Date()): NormalizedOrderDates {
  const todayStart = startOfDay(today);
  const decisionDate = startOfDay(o.decisionDate ?? o.createdAt ?? todayStart);

  const handedExpected = addDays(decisionDate, DEV_DAYS);
  const handedToFactoryDate = o.handedToFactoryDate && o.handedToFactoryDate >= handedExpected
    ? startOfDay(o.handedToFactoryDate)
    : handedExpected;

  const readyExpected = addDays(handedToFactoryDate, PROD_DAYS);
  const readyAtFactoryDate = o.readyAtFactoryDate && o.readyAtFactoryDate >= readyExpected
    ? startOfDay(o.readyAtFactoryDate)
    : readyExpected;

  const qcExpected = addDays(readyAtFactoryDate, QC_DAYS);
  const qcDate = o.qcDate && o.qcDate >= qcExpected
    ? startOfDay(o.qcDate)
    : qcExpected;

  const arrivalExpected = addDays(qcDate, SHIP_DAYS);
  const arrivalPlannedDate = o.arrivalPlannedDate && o.arrivalPlannedDate >= arrivalExpected
    ? startOfDay(o.arrivalPlannedDate)
    : arrivalExpected;

  return { decisionDate, handedToFactoryDate, readyAtFactoryDate, qcDate, arrivalPlannedDate };
}

export function orderDatesChanged(o: OrderDateFields, n: NormalizedOrderDates): boolean {
  return (
    !sameDay(o.decisionDate, n.decisionDate) ||
    !sameDay(o.handedToFactoryDate, n.handedToFactoryDate) ||
    !sameDay(o.readyAtFactoryDate, n.readyAtFactoryDate) ||
    !sameDay(o.qcDate, n.qcDate) ||
    !sameDay(o.arrivalPlannedDate, n.arrivalPlannedDate)
  );
}

export type PackagingDateFields = {
  decisionDate: Date | null;
  orderedDate: Date | null;
  productionEndDate: Date | null;
  expectedDate: Date | null;
  createdAt: Date;
};

export type NormalizedPackagingDates = {
  decisionDate: Date;
  orderedDate: Date;
  productionEndDate: Date;
  expectedDate: Date;
};

export function normalizePackagingDates(p: PackagingDateFields, today: Date = new Date()): NormalizedPackagingDates {
  const todayStart = startOfDay(today);
  const decisionDate = startOfDay(p.decisionDate ?? p.createdAt ?? todayStart);

  const orderedExpected = addDays(decisionDate, PACK_DEV_DAYS);
  const orderedDate = p.orderedDate && p.orderedDate >= orderedExpected
    ? startOfDay(p.orderedDate)
    : orderedExpected;

  const productionExpected = addDays(orderedDate, PACK_PROD_DAYS);
  const productionEndDate = p.productionEndDate && p.productionEndDate >= productionExpected
    ? startOfDay(p.productionEndDate)
    : productionExpected;

  const expectedExpected = addDays(productionEndDate, PACK_SHIP_DAYS);
  const expectedDate = p.expectedDate && p.expectedDate >= expectedExpected
    ? startOfDay(p.expectedDate)
    : expectedExpected;

  return { decisionDate, orderedDate, productionEndDate, expectedDate };
}

export function packagingDatesChanged(p: PackagingDateFields, n: NormalizedPackagingDates): boolean {
  return (
    !sameDay(p.decisionDate, n.decisionDate) ||
    !sameDay(p.orderedDate, n.orderedDate) ||
    !sameDay(p.productionEndDate, n.productionEndDate) ||
    !sameDay(p.expectedDate, n.expectedDate)
  );
}

export const NORMALIZE_DEFAULTS = {
  order: { development: DEV_DAYS, production: PROD_DAYS, qc: QC_DAYS, shipping: SHIP_DAYS },
  packaging: { development: PACK_DEV_DAYS, production: PACK_PROD_DAYS, shipping: PACK_SHIP_DAYS },
};
