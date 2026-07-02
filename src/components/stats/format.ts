import type { TrendMetricKey } from "@/lib/queries/stats-page";

/** 14800 → «14 800» — числа с разрядами читаются, слипшиеся — нет. */
export function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

/**
 * Деньги «по-человечески»: крупные суммы → «6,4 млн ₽», мелкие → «450 000 ₽».
 * Порог млн — от 1 000 000; одна цифра после запятой, «,0» не показываем.
 */
export function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    const mln = n / 1_000_000;
    const s = mln.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    return `${s} млн ₽`;
  }
  return `${fmt(Math.round(n))} ₽`;
}

/** Значение метрики тренда в подписи (штуки/фасоны — целые, деньги — «млн ₽»). */
export function fmtMetricValue(value: number, metric: TrendMetricKey): string {
  return metric === "money" ? fmtMoney(value) : fmt(value);
}
