import { parsePaymentTerms } from "./parse-terms";

// Сверка фактического графика платежей с условиями оплаты заказа.
// Возвращает null, если проверка неприменима (условия не парсятся,
// платежей нет, сумма нулевая). Иначе — совпадает ли и человекочитаемые доли.
export type TermsMismatch = {
  match: boolean;
  expectedLabel: string; // "30/70"
  actualLabel: string; // "50/50"
};

export function checkTermsMismatch(
  paymentTerms: string | null | undefined,
  amounts: number[],
): TermsMismatch | null {
  const shares = parsePaymentTerms(paymentTerms);
  if (!shares || shares.length === 0) return null;
  if (amounts.length === 0) return null;

  const total = amounts.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const actualShares = amounts.map((a) => a / total);
  const expectedLabel = shares.map((s) => formatPct(s)).join("/");
  const actualLabel = actualShares.map((s) => formatPct(s)).join("/");

  // Разное число платежей — расхождение (кроме случая, когда юзер осознанно
  // разбил долю на части: тогда доли всё равно не совпадут и подсветка честная).
  if (amounts.length !== shares.length) {
    return { match: false, expectedLabel, actualLabel };
  }

  // Допуск 2 п.п. на округления (33/33/34 и копейки).
  const TOLERANCE = 0.02;
  const match = shares.every((s, i) => Math.abs(s - actualShares[i]) <= TOLERANCE);
  return { match, expectedLabel, actualLabel };
}

function formatPct(share: number): string {
  return String(Math.round(share * 100));
}
