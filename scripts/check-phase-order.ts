import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function fmt(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

(async () => {
  const orders = await prisma.order.findMany({
    where: { deletedAt: null },
    include: { productModel: { select: { name: true } } },
  });

  console.log(`\n=== Проверка ${orders.length} заказов ===\n`);

  const violations: Array<{ id: string; n: number; title: string; status: string; problem: string; dates: string }> = [];

  for (const o of orders) {
    const dates = [
      { name: "decisionDate (старт Разработки)", d: o.decisionDate },
      { name: "handedToFactoryDate (старт Производства)", d: o.handedToFactoryDate },
      { name: "readyAtFactoryDate (старт ОТК)", d: o.readyAtFactoryDate },
      { name: "qcDate (старт Доставки)", d: o.qcDate },
      { name: "arrivalPlannedDate (конец Доставки)", d: o.arrivalPlannedDate },
    ];

    const filled = dates.filter((x) => x.d !== null);
    let problem: string | null = null;

    for (let i = 1; i < filled.length; i++) {
      const prev = filled[i - 1];
      const cur = filled[i];
      if (cur.d! < prev.d!) {
        problem = `${cur.name} (${fmt(cur.d)}) < ${prev.name} (${fmt(prev.d)})`;
        break;
      }
    }

    if (problem) {
      violations.push({
        id: o.id,
        n: o.orderNumber,
        title: o.productModel.name,
        status: o.status,
        problem,
        dates: dates.map((x) => `${x.name.split(" ")[0]}=${fmt(x.d)}`).join(" | "),
      });
    }
  }

  if (violations.length === 0) {
    console.log("✅ Все заказы — даты идут в правильном порядке (Разработка → Производство → ОТК → Доставка).\n");
  } else {
    console.log(`❌ Нарушение порядка фаз в ${violations.length} заказах:\n`);
    for (const v of violations) {
      console.log(`  [#${v.n}] ${v.title} (${v.status})`);
      console.log(`    Проблема: ${v.problem}`);
      console.log(`    Даты: ${v.dates}`);
      console.log("");
    }
  }

  // Также упаковка
  const packs = await prisma.packagingOrder.findMany({});
  const packV: Array<{ n: string; problem: string }> = [];
  for (const p of packs) {
    const arr = [
      { name: "decisionDate", d: (p as { decisionDate?: Date | null }).decisionDate ?? null },
      { name: "orderedDate", d: p.orderedDate },
      { name: "productionEndDate", d: p.productionEndDate },
      { name: "expectedDate", d: p.expectedDate },
    ].filter((x) => x.d !== null);
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].d! < arr[i - 1].d!) {
        packV.push({ n: p.orderNumber, problem: `${arr[i].name} (${fmt(arr[i].d)}) < ${arr[i - 1].name} (${fmt(arr[i - 1].d)})` });
        break;
      }
    }
  }

  console.log(`\n=== Проверка ${packs.length} заказов упаковки ===\n`);
  if (packV.length === 0) {
    console.log("✅ Все заказы упаковки — даты в правильном порядке.\n");
  } else {
    console.log(`❌ Нарушений: ${packV.length}\n`);
    for (const v of packV) console.log(`  [${v.n}] ${v.problem}`);
  }

  await prisma.$disconnect();
})();
