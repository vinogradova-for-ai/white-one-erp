// Чистая математика «Оплат фабрикам» — автораспределение суммы перевода по
// открытым плановым платежам и подсчёт статуса планового платежа по факту.
//
// Почему всё в копейках (целых числах): суммы — Decimal(14,2). Складывать их
// как JS-float опасно (0.1+0.2 != 0.3). Поэтому весь счёт ведём в целых
// копейках, а на выходе отдаём рубли строкой с двумя знаками (Prisma Decimal
// принимает строку без потерь).
//
// Ни одной зависимости от Prisma здесь нет — только числа. Так модуль легко
// покрыть юнит-тестами и переиспользовать на фронте (live-строка формы) и на
// бэке (валидация транзакции).

/** Перевести рублёвую сумму (число или строка «450000.50») в целые копейки. */
export function toKopecks(rub: number | string): number {
  const s = typeof rub === "number" ? rub.toFixed(2) : String(rub).trim();
  // Нормализуем: убираем пробелы-разделители, запятую как разделитель дробной части.
  const cleaned = s.replace(/\s/g, "").replace(",", ".");
  const neg = cleaned.startsWith("-");
  const [intPart, fracPartRaw = ""] = cleaned.replace(/^[-+]/, "").split(".");
  const frac = (fracPartRaw + "00").slice(0, 2); // добиваем/режем до 2 знаков
  const kop = Number(intPart || "0") * 100 + Number(frac || "0");
  return neg ? -kop : kop;
}

/** Копейки → рублёвая строка «450000.50» для Prisma Decimal. */
export function kopecksToRubString(kop: number): string {
  const neg = kop < 0;
  const abs = Math.abs(Math.round(kop));
  const rub = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${rub}.${frac}`;
}

/** Плановый платёж в терминах распределения: сколько всего и сколько уже разнесено. */
export type OpenPaymentInput = {
  id: string;
  /** Полная плановая сумма платежа, в копейках. */
  amountKopecks: number;
  /** Уже разнесено по этому платежу другими оплатами, в копейках. */
  allocatedKopecks: number;
};

export type AutoAllocationRow = {
  paymentId: string;
  /** Сколько назначено этой оплатой на данный платёж, в копейках. */
  amountKopecks: number;
};

export type AutoAllocationResult = {
  rows: AutoAllocationRow[];
  /** Сколько всего разнесено, в копейках. */
  allocatedKopecks: number;
  /** Нераспределённый остаток оплаты (>= 0), в копейках. */
  leftoverKopecks: number;
};

/**
 * Автораспределение: раскидываем сумму перевода сверху вниз по остаткам
 * открытых платежей. Первый платёж получает min(его остаток, вся сумма),
 * дальше по цепочке остатком суммы. Порядок платежей — как передали
 * (ожидается сортировка по plannedDate).
 *
 * remaining(платёж) = amount - allocated (не меньше нуля).
 * Если весь перевод не разошёлся — остаток числится нераспределённым.
 */
export function autoAllocate(
  totalKopecks: number,
  payments: OpenPaymentInput[],
): AutoAllocationResult {
  let left = Math.max(0, Math.round(totalKopecks));
  const rows: AutoAllocationRow[] = [];
  let allocated = 0;

  for (const p of payments) {
    if (left <= 0) break;
    const remaining = Math.max(0, p.amountKopecks - p.allocatedKopecks);
    if (remaining <= 0) continue;
    const take = Math.min(remaining, left);
    if (take <= 0) continue;
    rows.push({ paymentId: p.id, amountKopecks: take });
    allocated += take;
    left -= take;
  }

  return { rows, allocatedKopecks: allocated, leftoverKopecks: left };
}

export type PaymentFactStatus = "unpaid" | "partial" | "paid" | "legacy-paid";

/**
 * Статус планового платежа по факту разнесения.
 *
 * legacyPaid — старый флаг paid=true (в схеме status=PAID). Если у платежа нет
 * ни одного разнесения, но он помечен оплаченным по старинке — считаем
 * «оплачен (старая запись)». Как только появляются разнесения — статус
 * считается по ним (allocated >= amount → оплачен).
 */
export function paymentFactStatus(params: {
  amountKopecks: number;
  allocatedKopecks: number;
  legacyPaid: boolean;
}): PaymentFactStatus {
  const { amountKopecks, allocatedKopecks, legacyPaid } = params;
  if (allocatedKopecks <= 0) {
    return legacyPaid ? "legacy-paid" : "unpaid";
  }
  if (allocatedKopecks >= amountKopecks) return "paid";
  return "partial";
}

/**
 * Остаток к оплате по плановому платежу, в копейках (>= 0).
 * Legacy-оплаченный без разнесений считаем закрытым (остаток 0) — чтобы он не
 * всплывал в списке открытых платежей формы.
 */
export function paymentRemainingKopecks(params: {
  amountKopecks: number;
  allocatedKopecks: number;
  legacyPaid: boolean;
}): number {
  const { amountKopecks, allocatedKopecks, legacyPaid } = params;
  if (allocatedKopecks <= 0 && legacyPaid) return 0;
  return Math.max(0, amountKopecks - allocatedKopecks);
}
