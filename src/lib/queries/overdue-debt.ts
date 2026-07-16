import { prisma } from "@/lib/prisma";
import { moscowTodayStart } from "@/lib/dates";

// Единая правда о долге (П1 UX-аудита): «Долг фабрикам сейчас» =
// ВСЕ неоплаченные платежи с плановой датой раньше сегодня, без нулевых.
// Один расчёт для /payments (красный блок) и сводки на главной —
// чтобы числа на разных экранах не расходились.
export type OverdueDebt = {
  count: number; // всего просроченных платежей (RUB + CNY)
  sumRub: number;
  countCny: number;
  sumCny: number;
};

export async function getOverdueDebt(now: Date = moscowTodayStart()): Promise<OverdueDebt> {
  const rows = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      plannedDate: { lt: now },
      amount: { gt: 0 },
    },
    select: { amount: true, currency: true },
  });
  let sumRub = 0;
  let sumCny = 0;
  let countCny = 0;
  for (const r of rows) {
    if (r.currency === "CNY") {
      sumCny += Number(r.amount);
      countCny++;
    } else {
      sumRub += Number(r.amount);
    }
  }
  return { count: rows.length, sumRub, countCny, sumCny };
}

// «Просрочено ранее: 34 995 798 ₽ · 58 шт» (+ юани отдельной скобкой, если есть).
export function formatOverdueDebt(d: OverdueDebt): string {
  const parts = [`${Math.round(d.sumRub).toLocaleString("ru-RU")} ₽ · ${d.count} шт`];
  if (d.countCny > 0) {
    parts.push(`в т.ч. ${Math.round(d.sumCny).toLocaleString("ru-RU")} ¥`);
  }
  return parts.join(" · ");
}
