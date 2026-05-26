/**
 * Превью чек-листов «Главного» по живым данным проды.
 *
 * Применяет 7 типов задач к каждому фасону/заказу и группирует
 * результат по ownerId — то, что увидит каждый PM на экране.
 *
 * Также проверяет: все ли товары имеют ответственного.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

type Task = {
  ownerId: string;
  ownerName: string;
  text: string;
  daysToDeadline: number | null; // null = без даты
  source: string;
};

const DAY = 86_400_000;
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function daysFromToday(d: Date | null): number | null {
  if (!d) return null;
  return Math.round((d.getTime() - TODAY.getTime()) / DAY);
}

async function main() {
  const [models, orders] = await Promise.all([
    p.productModel.findMany({
      where: { deletedAt: null, activated: true },
      include: {
        owner: { select: { id: true, name: true } },
        _count: { select: { orders: true } },
        orders: {
          where: { deletedAt: null, status: { notIn: ["ON_SALE"] } },
          select: { status: true },
        },
      },
    }),
    p.order.findMany({
      where: { deletedAt: null, status: { notIn: ["ON_SALE"] } },
      include: {
        owner: { select: { id: true, name: true } },
        productModel: { select: { name: true } },
      },
    }),
  ]);

  // === Аудит: у всех ли есть ответственный? ===
  const modelsNoOwner = models.filter((m) => !m.ownerId || !m.owner);
  const ordersNoOwner = orders.filter((o) => !o.ownerId || !o.owner);
  console.log("=== АУДИТ ОТВЕТСТВЕННЫХ ===");
  console.log(`Фасонов всего: ${models.length}; без ответственного: ${modelsNoOwner.length}`);
  console.log(`Заказов в работе: ${orders.length}; без ответственного: ${ordersNoOwner.length}`);
  if (modelsNoOwner.length > 0) {
    for (const m of modelsNoOwner) console.log(`  ⚠ фасон без owner: ${m.name}`);
  }
  if (ordersNoOwner.length > 0) {
    for (const o of ordersNoOwner) console.log(`  ⚠ заказ без owner: ${o.orderNumber} (${o.productModel.name})`);
  }

  // === Генерация задач ===
  const tasks: Task[] = [];

  // Фасонные задачи (1-4).
  for (const m of models) {
    if (!m.ownerId || !m.owner) continue;

    // hasActiveLiveOrder = есть заказ в производстве/доставке (не PREPARATION).
    // Если есть — задачи разработки больше не показываем.
    const hasLiveOrder = m.orders.some((o) => o.status !== "PREPARATION");

    // 1. Закажите образец (фасон IDEA, нет живого заказа)
    if (m.status === "IDEA" && !hasLiveOrder) {
      tasks.push({
        ownerId: m.ownerId,
        ownerName: m.owner.name,
        text: `Закажите образец · ${m.name}`,
        daysToDeadline: m.plannedLaunchMonth ? daysFromMonth(m.plannedLaunchMonth, -90) : null,
        source: m.id,
      });
    }

    // 2. Утвердите идеальный образец (PATTERNS/SAMPLE без живого заказа)
    if ((m.status === "PATTERNS" || m.status === "SAMPLE") && !hasLiveOrder) {
      tasks.push({
        ownerId: m.ownerId,
        ownerName: m.owner.name,
        text: `Утвердите идеальный образец · ${m.name}`,
        daysToDeadline: m.plannedLaunchMonth ? daysFromMonth(m.plannedLaunchMonth, -75) : null,
        source: m.id,
      });
    }

    // 3. Сделайте размерную сетку (APPROVED + sizeChartReady=false)
    if (m.status === "APPROVED" && !m.sizeChartReady) {
      tasks.push({
        ownerId: m.ownerId,
        ownerName: m.owner.name,
        text: `Сделайте размерную сетку · ${m.name}`,
        daysToDeadline: m.plannedLaunchMonth ? daysFromMonth(m.plannedLaunchMonth, -60) : null,
        source: m.id,
      });
    }

    // 4. Запустите производство (APPROVED + sizeChartReady, но нет живого заказа)
    if (m.status === "APPROVED" && m.sizeChartReady && !hasLiveOrder) {
      tasks.push({
        ownerId: m.ownerId,
        ownerName: m.owner.name,
        text: `Запустите производство · ${m.name}`,
        daysToDeadline: m.plannedLaunchMonth ? daysFromMonth(m.plannedLaunchMonth, -50) : null,
        source: m.id,
      });
    }
  }

  // Заказные задачи (5-7).
  for (const o of orders) {
    if (!o.ownerId || !o.owner) continue;
    const title = `${o.orderNumber} · ${o.productModel.name}`;

    // 5. Закажите ОТК — заказ в SEWING, до готовности на фабрике ≤ 7 дн (или просрочено)
    if (o.status === "SEWING" && o.readyAtFactoryDate) {
      const days = daysFromToday(o.readyAtFactoryDate);
      if (days !== null && days <= 7) {
        tasks.push({
          ownerId: o.ownerId,
          ownerName: o.owner.name,
          text: days < 0
            ? `Закажите ОТК · ${title} (фабрика опаздывает на ${-days} дн)`
            : `Товар будет готов через ${days} дн — закажите ОТК · ${title}`,
          daysToDeadline: days,
          source: o.id,
        });
      }
    }

    // 6. Примите ОТК — заказ QC/READY_SHIP, до отгрузки ≤ 7 дн
    if ((o.status === "QC" || o.status === "READY_SHIP") && o.qcDate) {
      const days = daysFromToday(o.qcDate);
      if (days !== null && days <= 7) {
        tasks.push({
          ownerId: o.ownerId,
          ownerName: o.owner.name,
          text: days < 0
            ? `Примите ОТК — пора отгружать · ${title} (просрочено ${-days} дн)`
            : `Примите ОТК — пора отгружать через ${days} дн · ${title}`,
          daysToDeadline: days,
          source: o.id,
        });
      }
    }

    // 7. Проверьте доставку — заказ IN_TRANSIT, до прибытия ≤ 7 дн (или просрочено)
    if (o.status === "IN_TRANSIT" && o.arrivalPlannedDate) {
      const days = daysFromToday(o.arrivalPlannedDate);
      if (days !== null && days <= 7) {
        tasks.push({
          ownerId: o.ownerId,
          ownerName: o.owner.name,
          text: days < 0
            ? `Проверьте доставку — должна была прибыть ${-days} дн назад · ${title}`
            : `Через ${days} дн проверьте доставку · ${title}`,
          daysToDeadline: days,
          source: o.id,
        });
      }
    }
  }

  // === Группировка ===
  const byOwner = new Map<string, Task[]>();
  for (const t of tasks) {
    const arr = byOwner.get(t.ownerName) ?? [];
    arr.push(t);
    byOwner.set(t.ownerName, arr);
  }

  console.log(`\n=== ЧЕК-ЛИСТЫ ПО ОТВЕТСТВЕННЫМ ===`);
  console.log(`Всего задач: ${tasks.length}`);

  const owners = [...byOwner.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [name, list] of owners) {
    console.log(`\n──── ${name} (${list.length}) ────`);
    // Сортируем: просрочка → срочно → позже → без даты
    list.sort((a, b) => {
      const aKey = a.daysToDeadline ?? 999999;
      const bKey = b.daysToDeadline ?? 999999;
      return aKey - bKey;
    });
    for (const t of list) {
      const flag = t.daysToDeadline === null ? "  "
        : t.daysToDeadline < 0 ? "🔴"
        : t.daysToDeadline <= 3 ? "🟡"
        : "⚪";
      console.log(`  ${flag} ${t.text}`);
    }
  }

  await p.$disconnect();
}

function daysFromMonth(yyyymm: number, offsetDays: number): number {
  const y = Math.floor(yyyymm / 100);
  const m = yyyymm % 100;
  const first = new Date(Date.UTC(y, m - 1, 1));
  const target = new Date(first.getTime() + offsetDays * DAY);
  return Math.round((target.getTime() - TODAY.getTime()) / DAY);
}

main().catch((e) => { console.error(e); process.exit(1); });
