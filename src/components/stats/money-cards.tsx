"use client";

import type { ProductMoney } from "@/lib/queries/stats-page";
import { fmtMoney } from "./format";

/**
 * Деньги продукта за месяц — 4 карточки. Только операционка производства:
 * заказано на сумму, оплачено фабрикам, товар в пути на сумму, платежи след.
 * месяца по графику. Никакой выручки/маржи/продаж WB.
 */

type CardDef = { key: keyof ProductMoney; title: string; hint: string };

const CARDS: CardDef[] = [
  { key: "orderedAmount", title: "Заказано на сумму", hint: "себестоимость заказов месяца" },
  { key: "paidToFactories", title: "Оплачено фабрикам", hint: "фактические переводы за месяц" },
  { key: "inTransitAmount", title: "Товар в пути", hint: "стоимость заказов в доставке сейчас" },
  { key: "nextMonthPayments", title: "Платежи след. месяца", hint: "по графику, ещё не закрыты" },
];

export function MoneyCards({ money }: { money: ProductMoney }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CARDS.map((c) => (
        <div key={c.key} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
          <div className="text-xs font-medium text-slate-500">{c.title}</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
            {fmtMoney(money[c.key])}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}
