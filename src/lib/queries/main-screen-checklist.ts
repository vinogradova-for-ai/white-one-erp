import { prisma } from "@/lib/prisma";
import { moscowTodayStart } from "@/lib/dates";

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
    // Образцы-сущности (Sample): точные задачи по конкретному образцу
    | "sample-verdict"       // образец получен — дайте вердикт (ок/на доработку)
    | "sample-stuck"         // образец заказан/едет слишком долго — дёрните фабрику
    | "size-chart"
    | "start-production"
    | "order-qc"
    | "accept-qc"
    | "check-delivery"
    // Разработка упаковки — lifecycle PackagingItem (IDEA → DESIGN → SAMPLE → APPROVED → ACTIVE)
    | "pkg-design"           // нет макета (status = IDEA/DESIGN, designReadyDate = null)
    | "pkg-sample"           // макет готов, нет образца (DESIGN+designReady или SAMPLE без sampleRequestedDate)
    | "pkg-approve"          // образец заказан, не утверждён
    | "pkg-launch"           // утверждено, не запущено в производство
    // Заказы упаковки в пути
    | "pkg-check-delivery"   // PackagingOrder со статусом IN_PRODUCTION/IN_TRANSIT, ожидаемая дата близка/прошла
    // Деньги: плановый платёж просрочен или скоро — отметить оплату/перенести срок
    | "payment-due";
  /** Возраст задачи в днях (для разработки — `today - model.updatedAt`).
   *  Используется визуально (старение рамки) и для счётчика «в разработке >30 дн». */
  ageInDays: number | null;
  /** Превышен ли SLA для задач разработки. true → попадает в «Сейчас» как красная. */
  slaBreached: boolean;
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

/** SLA для задач разработки — за сколько дней с момента последнего движения фасона
 *  задача должна закрыться. Превышено → задача попадает в «Сейчас» как просрочка
 *  даже если у фасона нет plannedLaunchMonth. updatedAt используется как proxy для
 *  «давно не двигалось» (быстро, без миграции statusChangedAt). */
const SLA_DAYS_BY_KIND: Record<
  "order-sample" | "approve-sample" | "size-chart" | "start-production",
  number
> = {
  "order-sample": 14,
  // Алёна: «2 недели шьют образец — хороший повод вспомнить». Сократили с 21 до 14.
  "approve-sample": 14,
  "size-chart": 7,
  "start-production": 7,
};

/** SLA для разработки упаковки — у PackagingItem нет launchMonth, поэтому
 *  единственный сигнал «застряли» — это возраст updatedAt. Цифры консервативные:
 *  макет/образец/утверждение/запуск всё долгое — но если ещё ничего не движется
 *  3+ недели, явный сигнал «забыли». */
const PKG_SLA_DAYS_BY_KIND: Record<
  "pkg-design" | "pkg-sample" | "pkg-approve" | "pkg-launch",
  number
> = {
  "pkg-design": 14,
  "pkg-sample": 21,
  "pkg-approve": 14,
  "pkg-launch": 7,
};

/** Понятный человеку статус фасона — для подсказки в idle/overdue. */
const MODEL_STATUS_RU: Record<string, string> = {
  IDEA: "идея",
  PATTERNS: "лекала",
  SAMPLE: "образец шьётся",
  APPROVED: "образец утверждён",
  IN_PRODUCTION: "в производстве",
};

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
  const today = moscowTodayStart();

  const [models, orders, packagingItems, packagingOrders, duePayments, samples] = await Promise.all([
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
    // Разработка упаковки — только активные, не архив.
    // Берём всё кроме ARCHIVED, т.к. lifecycle прерывается на любом этапе IDEA→ACTIVE.
    prisma.packagingItem.findMany({
      where: { isActive: true, status: { not: "ARCHIVED" } },
      include: {
        owner: { select: { id: true, name: true } },
      },
    }),
    // Заказы упаковки в пути — IN_PRODUCTION / IN_TRANSIT.
    // ORDERED означает что только что заказали (ждём подтверждение фабрики), пока не трогаем.
    // ARRIVED/CANCELLED — закрыты.
    prisma.packagingOrder.findMany({
      where: { status: { in: ["IN_PRODUCTION", "IN_TRANSIT"] } },
      include: {
        owner: { select: { id: true, name: true } },
      },
    }),
    // Плановые платежи: просроченные + ближайшие 7 дней. Просроченный и не
    // отмеченный платёж = вкладка «Платежи» врёт про долги фабрикам.
    prisma.payment.findMany({
      where: {
        status: "PENDING",
        plannedDate: { lt: new Date(today.getTime() + 8 * DAY) },
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            productModel: { select: { name: true } },
            owner: { select: { id: true, name: true } },
          },
        },
        packagingItem: { select: { name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    // Образцы в работе: получен без вердикта / заказан-едет слишком долго.
    prisma.sample.findMany({
      where: {
        deletedAt: null,
        status: { in: ["ORDERED", "IN_TRANSIT", "RECEIVED"] },
        productModel: { deletedAt: null },
      },
      include: {
        productModel: {
          select: { id: true, name: true, ownerId: true, owner: { select: { id: true, name: true } } },
        },
      },
    }),
  ]);

  const tasks: ChecklistTask[] = [];

  for (const m of models) {
    if (!m.ownerId || !m.owner) continue;

    const hasLiveOrder = m.orders.some((o) => o.status !== "PREPARATION");
    const baseHref = `/models/${m.id}`;

    const ageInDays = Math.max(0, Math.round((today.getTime() - m.updatedAt.getTime()) / DAY));

    const pushDev = (
      kind: keyof typeof BUFFER_DAYS_BY_KIND,
      text: string,
    ) => {
      const days = m.plannedLaunchMonth
        ? daysFromMonth(m.plannedLaunchMonth, BUFFER_DAYS_BY_KIND[kind], today)
        : null;
      const sla = SLA_DAYS_BY_KIND[kind];
      const slaBreached = ageInDays > sla;

      // С launchMonth: показываем только если попало в окно 14 дней либо просрочено.
      // Без launchMonth: показываем как idle.
      // Если SLA превышен — задача всегда видна как «Сейчас» (overdue), даже если launchMonth далеко.
      if (!slaBreached && days !== null && days > URGENCY_WINDOW_DAYS) return;

      // Если SLA превышен — насильно поднимаем urgency до overdue (видна в «Сейчас»).
      const baseUrgency = urgencyOf(days);
      const urgency: TaskUrgency = slaBreached ? "overdue" : baseUrgency;

      // Подпись статуса — чтобы в «Давно не двигалось» было видно где застрял
      // фасон («идея», «образец шьётся», «образец утверждён» и т.д.).
      const statusRu = MODEL_STATUS_RU[m.status] ?? m.status.toLowerCase();
      const ageStr = `${ageInDays} дн без движения`;
      const tail = slaBreached
        ? `${statusRu} · ${ageStr}`
        : days === null
        ? `${statusRu} · ${ageStr}`
        : null;

      tasks.push({
        id: `${kind}:${m.id}`,
        ownerId: m.ownerId!,
        ownerName: m.owner!.name,
        text: tail ? `${text} · ${tail}` : text,
        href: baseHref,
        daysToDeadline: days,
        urgency,
        updatedAt: m.updatedAt,
        kind,
        ageInDays,
        slaBreached,
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

  // === Платежи — просроченные и ближайшие ===
  // Владелец задачи: ответственный по заказу; для упаковки — кто завёл платёж.
  for (const p of duePayments) {
    const owner = p.order?.owner ?? p.createdBy;
    if (!owner) continue;
    const target = p.order
      ? `${p.order.orderNumber} · ${p.order.productModel.name}`
      : (p.packagingItem?.name ?? "упаковка");
    const amount = `${Math.round(Number(p.amount)).toLocaleString("ru-RU")} ${p.currency === "CNY" ? "¥" : "₽"}`;
    const days = daysFromToday(p.plannedDate, today);
    const text =
      days !== null && days < 0
        ? `Оплата просрочена ${-days} дн — отметьте или перенесите срок · ${p.label} · ${amount} · ${target}`
        : `Оплата через ${days} дн · ${p.label} · ${amount} · ${target}`;
    tasks.push({
      id: `payment-due:${p.id}`,
      ownerId: owner.id,
      ownerName: owner.name,
      text,
      href: "/payments",
      daysToDeadline: days,
      urgency: urgencyOf(days),
      updatedAt: p.updatedAt,
      kind: "payment-due",
      ageInDays: null,
      slaBreached: days !== null && days < 0,
    });
  }

  // === Образцы (Sample) — точные задачи по конкретному образцу ===
  // «Получен — дайте вердикт»: дедлайн = получен + 2 дн.
  // «Завис»: заказан/едет дольше 14 дн — дёрните фабрику (без дедлайна, но overdue).
  const SAMPLE_VERDICT_SLA_DAYS = 2;
  const SAMPLE_STUCK_DAYS = 14;
  for (const s of samples) {
    const m = s.productModel;
    if (!m.ownerId || !m.owner) continue;
    const name = s.label ? `${m.name} (${s.label})` : m.name;
    const href = `/models/${m.id}`;

    if (s.status === "RECEIVED") {
      const received = s.receivedDate ?? s.updatedAt;
      const deadline = new Date(received.getTime() + SAMPLE_VERDICT_SLA_DAYS * DAY);
      const days = daysFromToday(deadline, today);
      const age = Math.max(0, Math.round((today.getTime() - received.getTime()) / DAY));
      tasks.push({
        id: `sample-verdict:${s.id}`,
        ownerId: m.ownerId,
        ownerName: m.owner.name,
        text: `Дайте вердикт по образцу · ${name} · получен ${age} дн назад`,
        href,
        daysToDeadline: days,
        urgency: urgencyOf(days),
        updatedAt: s.updatedAt,
        kind: "sample-verdict",
        ageInDays: age,
        slaBreached: days !== null && days < 0,
      });
    } else {
      // ORDERED / IN_TRANSIT
      const since = s.orderedDate ?? s.createdAt;
      const age = Math.max(0, Math.round((today.getTime() - since.getTime()) / DAY));
      if (age <= SAMPLE_STUCK_DAYS) continue;
      const statusRu = s.status === "ORDERED" ? "заказан" : "едет";
      tasks.push({
        id: `sample-stuck:${s.id}`,
        ownerId: m.ownerId,
        ownerName: m.owner.name,
        text: `Образец завис (${statusRu} ${age} дн) — дёрните фабрику · ${name}`,
        href,
        daysToDeadline: null,
        urgency: "overdue",
        updatedAt: s.updatedAt,
        kind: "sample-stuck",
        ageInDays: age,
        slaBreached: true,
      });
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
          ageInDays: null,
          slaBreached: false,
        });
      }
    }

    // Показываем «Примите ОТК» ТОЛЬКО пока заказ в статусе QC и ждёт приёмки.
    // Галка ставит READY_SHIP — и задача больше не возвращается (принцип «галка =
    // задача ушла из чек-листа»). Раньше условие включало READY_SHIP → закрытая
    // задача воскресала после revalidate и висела красной до IN_TRANSIT.
    if (o.status === "QC" && o.qcDate) {
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
          ageInDays: null,
          slaBreached: false,
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
          ageInDays: null,
          slaBreached: false,
        });
      }
    }
  }

  // Разработка упаковки. Lifecycle PackagingItem:
  //   IDEA       — ещё не начали → «Сделайте макет»
  //   DESIGN     — макет в работе → «Сделайте макет» (если designReadyDate пуст)
  //                                  «Закажите образец» (если макет готов)
  //   SAMPLE     — образец заказан → «Утвердите образец»
  //   APPROVED   — образец утверждён → «Запустите в производство»
  //   ACTIVE     — норма, нет задачи
  // Дедлайнов нет — все задачи idle, SLA только по возрасту updatedAt.
  for (const p of packagingItems) {
    if (!p.ownerId || !p.owner) continue;
    const ageInDays = Math.max(0, Math.round((today.getTime() - p.updatedAt.getTime()) / DAY));
    const baseHref = `/packaging`;

    const pushPkg = (
      kind: keyof typeof PKG_SLA_DAYS_BY_KIND,
      text: string,
    ) => {
      const sla = PKG_SLA_DAYS_BY_KIND[kind];
      const slaBreached = ageInDays > sla;
      const urgency: TaskUrgency = slaBreached ? "overdue" : "idle";
      const ageStr = `${ageInDays} дн без движения`;
      tasks.push({
        id: `${kind}:${p.id}`,
        ownerId: p.ownerId!,
        ownerName: p.owner!.name,
        text: `${text} · ${ageStr}`,
        href: baseHref,
        daysToDeadline: null,
        urgency,
        updatedAt: p.updatedAt,
        kind,
        ageInDays,
        slaBreached,
      });
    };

    if (p.status === "IDEA" || (p.status === "DESIGN" && !p.designReadyDate)) {
      pushPkg("pkg-design", `Сделайте макет упаковки · ${p.name}`);
    } else if (p.status === "DESIGN" && p.designReadyDate && !p.sampleRequestedDate) {
      pushPkg("pkg-sample", `Закажите образец упаковки · ${p.name}`);
    } else if (p.status === "SAMPLE" && !p.sampleApprovedDate) {
      pushPkg("pkg-approve", `Утвердите образец упаковки · ${p.name}`);
    } else if (p.status === "APPROVED" && !p.productionStartDate) {
      pushPkg("pkg-launch", `Запустите упаковку в производство · ${p.name}`);
    }
  }

  // Заказы упаковки в пути — отслеживаем expectedDate.
  // IN_PRODUCTION → ждём productionEndDate (если есть) или expectedDate как fallback.
  // IN_TRANSIT → ждём expectedDate.
  for (const po of packagingOrders) {
    if (!po.ownerId || !po.owner) continue;
    const target = po.status === "IN_PRODUCTION"
      ? (po.productionEndDate ?? po.expectedDate)
      : po.expectedDate;
    if (!target) continue;
    const days = daysFromToday(target, today);
    if (days === null || days > URGENCY_WINDOW_DAYS) continue;

    const phaseLabel = po.status === "IN_PRODUCTION" ? "готовности у фабрики" : "прибытия";
    const text = days < 0
      ? `Проверьте упаковку — ждали ${phaseLabel} ${-days} дн назад · ${po.orderNumber}`
      : `Через ${days} дн проверьте упаковку (${po.status === "IN_PRODUCTION" ? "у фабрики" : "доставка"}) · ${po.orderNumber}`;

    tasks.push({
      id: `pkg-check-delivery:${po.id}`,
      ownerId: po.ownerId,
      ownerName: po.owner.name,
      text,
      href: `/packaging-orders/${po.id}`,
      daysToDeadline: days,
      urgency: urgencyOf(days),
      updatedAt: po.updatedAt,
      kind: "pkg-check-delivery",
      ageInDays: null,
      slaBreached: false,
    });
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
