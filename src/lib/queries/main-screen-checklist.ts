import { prisma } from "@/lib/prisma";

/**
 * Чек-лист «Главного» экрана. Семь типов задач, привязанных к фасонам и заказам.
 * Окно срочности — 5 дней до даты-цели; всё что дальше — не показываем.
 * Просрочка остаётся в списке с пометкой и красным флагом.
 *
 * Сортировка для задач разработки (типы 1-4):
 *   есть plannedLaunchMonth → считаем дедлайн с буфером, применяем порог 5 дн;
 *   нет → daysToDeadline = null, попадают в «давно не двигалось», сортируются по updatedAt.
 */

export type TaskUrgency = "overdue" | "soon" | "this-week" | "next-week" | "idle";

/** Зона на «Главном» — определяет в какой раздел попадёт задача. */
export type TaskZone = "now" | "this-week" | "next-week";

export function zoneOf(urgency: TaskUrgency): TaskZone {
  if (urgency === "overdue" || urgency === "soon" || urgency === "idle") return "now";
  if (urgency === "this-week") return "this-week";
  return "next-week";
}

export type ChecklistTask = {
  id: string;
  ownerId: string;
  ownerName: string;
  text: string;
  href: string;
  daysToDeadline: number | null;
  urgency: TaskUrgency;
  /** Для задач без deadline (urgency=idle) — для сортировки по «давно не двигалось». */
  updatedAt: Date | null;
  kind:
    | "order-sample"
    | "approve-sample"
    | "size-chart"
    | "start-production"
    | "order-qc"
    | "accept-qc"
    | "check-delivery";
};

const DAY = 86_400_000;
// Расширили окно показа до 14 дней — это горизонт планирования будущей нагрузки.
// На UI разводим по трём зонам: «Сейчас» (≤2 + просрочка), «На неделе» (3-7),
// «Следующая неделя» (8-14). Задачи с дедлайном >14 дн не показываются.
const URGENCY_WINDOW_DAYS = 14;
const SOON_WITHIN_DAYS = 2;
const THIS_WEEK_WITHIN_DAYS = 7;

/** Буферы для задач разработки относительно plannedLaunchMonth (в днях до 1-го числа). */
const BUFFER_DAYS_BY_KIND: Record<
  "order-sample" | "approve-sample" | "size-chart" | "start-production",
  number
> = {
  "order-sample": 90,
  "approve-sample": 75,
  "size-chart": 60,
  "start-production": 50,
};

function moscowToday(): Date {
  const now = new Date();
  const moscow = new Date(now.getTime() + (3 * 60 - now.getTimezoneOffset()) * 60_000);
  moscow.setUTCHours(0, 0, 0, 0);
  return moscow;
}

function daysFromToday(target: Date | null, today: Date): number | null {
  if (!target) return null;
  return Math.round((target.getTime() - today.getTime()) / DAY);
}

function daysFromMonth(yyyymm: number, offsetBackDays: number, today: Date): number {
  const y = Math.floor(yyyymm / 100);
  const m = yyyymm % 100;
  const first = Date.UTC(y, m - 1, 1);
  const target = first - offsetBackDays * DAY;
  return Math.round((target - today.getTime()) / DAY);
}

function urgencyOf(days: number | null): TaskUrgency {
  if (days === null) return "idle";
  if (days < 0) return "overdue";
  if (days <= SOON_WITHIN_DAYS) return "soon";
  if (days <= THIS_WEEK_WITHIN_DAYS) return "this-week";
  return "next-week";
}

export async function getMainScreenChecklist(): Promise<ChecklistTask[]> {
  const today = moscowToday();

  const [models, orders] = await Promise.all([
    prisma.productModel.findMany({
      where: { deletedAt: null, activated: true },
      include: {
        owner: { select: { id: true, name: true } },
        orders: {
          where: { deletedAt: null, status: { notIn: ["ON_SALE"] } },
          select: { status: true },
        },
      },
    }),
    prisma.order.findMany({
      where: { deletedAt: null, status: { notIn: ["ON_SALE"] } },
      include: {
        owner: { select: { id: true, name: true } },
        productModel: { select: { name: true } },
      },
    }),
  ]);

  const tasks: ChecklistTask[] = [];

  for (const m of models) {
    if (!m.ownerId || !m.owner) continue;

    const hasLiveOrder = m.orders.some((o) => o.status !== "PREPARATION");
    const baseHref = `/models/${m.id}`;

    const pushDev = (
      kind: keyof typeof BUFFER_DAYS_BY_KIND,
      text: string,
    ) => {
      const days = m.plannedLaunchMonth
        ? daysFromMonth(m.plannedLaunchMonth, BUFFER_DAYS_BY_KIND[kind], today)
        : null;
      // С launchMonth: показываем только если попало в окно 5 дней либо просрочено.
      // Без launchMonth: показываем как idle.
      if (days !== null && days > URGENCY_WINDOW_DAYS) return;
      tasks.push({
        id: `${kind}:${m.id}`,
        ownerId: m.ownerId!,
        ownerName: m.owner!.name,
        text,
        href: baseHref,
        daysToDeadline: days,
        urgency: urgencyOf(days),
        updatedAt: m.updatedAt,
        kind,
      });
    };

    if (m.status === "IDEA" && !hasLiveOrder) {
      pushDev("order-sample", `Закажите образец · ${m.name}`);
    }
    if ((m.status === "PATTERNS" || m.status === "SAMPLE") && !hasLiveOrder) {
      pushDev("approve-sample", `Утвердите идеальный образец · ${m.name}`);
    }
    if (m.status === "APPROVED" && !m.sizeChartReady) {
      pushDev("size-chart", `Сделайте размерную сетку · ${m.name}`);
    }
    if (m.status === "APPROVED" && m.sizeChartReady && !hasLiveOrder) {
      pushDev("start-production", `Запустите производство · ${m.name}`);
    }
  }

  for (const o of orders) {
    if (!o.ownerId || !o.owner) continue;
    const title = `${o.orderNumber} · ${o.productModel.name}`;
    const baseHref = `/orders/${o.id}`;

    if (o.status === "SEWING" && o.readyAtFactoryDate) {
      const days = daysFromToday(o.readyAtFactoryDate, today);
      if (days !== null && days <= URGENCY_WINDOW_DAYS) {
        tasks.push({
          id: `order-qc:${o.id}`,
          ownerId: o.ownerId,
          ownerName: o.owner.name,
          text:
            days < 0
              ? `Закажите ОТК · ${title} (фабрика опаздывает на ${-days} дн)`
              : `Товар будет готов через ${days} дн — закажите ОТК · ${title}`,
          href: baseHref,
          daysToDeadline: days,
          urgency: urgencyOf(days),
          updatedAt: o.updatedAt,
          kind: "order-qc",
        });
      }
    }

    if ((o.status === "QC" || o.status === "READY_SHIP") && o.qcDate) {
      const days = daysFromToday(o.qcDate, today);
      if (days !== null && days <= URGENCY_WINDOW_DAYS) {
        tasks.push({
          id: `accept-qc:${o.id}`,
          ownerId: o.ownerId,
          ownerName: o.owner.name,
          text:
            days < 0
              ? `Примите ОТК — пора отгружать · ${title} (просрочено ${-days} дн)`
              : `Примите ОТК — пора отгружать через ${days} дн · ${title}`,
          href: baseHref,
          daysToDeadline: days,
          urgency: urgencyOf(days),
          updatedAt: o.updatedAt,
          kind: "accept-qc",
        });
      }
    }

    if (o.status === "IN_TRANSIT" && o.arrivalPlannedDate) {
      const days = daysFromToday(o.arrivalPlannedDate, today);
      if (days !== null && days <= URGENCY_WINDOW_DAYS) {
        tasks.push({
          id: `check-delivery:${o.id}`,
          ownerId: o.ownerId,
          ownerName: o.owner.name,
          text:
            days < 0
              ? `Проверьте доставку — должна была прибыть ${-days} дн назад · ${title}`
              : `Через ${days} дн проверьте доставку · ${title}`,
          href: baseHref,
          daysToDeadline: days,
          urgency: urgencyOf(days),
          updatedAt: o.updatedAt,
          kind: "check-delivery",
        });
      }
    }
  }

  return tasks;
}

export function groupByOwner(tasks: ChecklistTask[]): Array<{
  ownerId: string;
  ownerName: string;
  tasks: ChecklistTask[];
}> {
  const map = new Map<string, { ownerId: string; ownerName: string; tasks: ChecklistTask[] }>();
  for (const t of tasks) {
    const cur = map.get(t.ownerId) ?? { ownerId: t.ownerId, ownerName: t.ownerName, tasks: [] };
    cur.tasks.push(t);
    map.set(t.ownerId, cur);
  }
  for (const group of map.values()) {
    group.tasks.sort(compareTasks);
  }
  return [...map.values()].sort((a, b) => b.tasks.length - a.tasks.length);
}

function compareTasks(a: ChecklistTask, b: ChecklistTask): number {
  // Сначала всё с дедлайном (по возрастанию дней), потом idle (по updatedAt ASC — давно не двигалось).
  const aHas = a.daysToDeadline !== null;
  const bHas = b.daysToDeadline !== null;
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  if (aHas && bHas) return a.daysToDeadline! - b.daysToDeadline!;
  const at = a.updatedAt?.getTime() ?? 0;
  const bt = b.updatedAt?.getTime() ?? 0;
  return at - bt;
}
