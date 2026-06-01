import { describe, it, expect } from "vitest";
import {
  parsePaymentTerms,
  allocatePaymentDates,
  paymentLabel,
} from "@/lib/payments/parse-terms";

// Regression-тесты: фиксируем ТЕКУЩЕЕ поведение парсера условий оплаты,
// раскладки дат платежей и человекочитаемых лейблов.
// Деньги/даты/доли — не должны молча поехать при рефакторинге.

describe("parsePaymentTerms — проценты", () => {
  it("'30/70' → [0.3, 0.7]", () => {
    expect(parsePaymentTerms("30/70")).toEqual([0.3, 0.7]);
  });

  it("'50/50' → [0.5, 0.5]", () => {
    expect(parsePaymentTerms("50/50")).toEqual([0.5, 0.5]);
  });

  it("три доли '50/30/20' → [0.5, 0.3, 0.2]", () => {
    expect(parsePaymentTerms("50/30/20")).toEqual([0.5, 0.3, 0.2]);
  });

  it("'30/30/40' → [0.3, 0.3, 0.4]", () => {
    expect(parsePaymentTerms("30/30/40")).toEqual([0.3, 0.3, 0.4]);
  });
});

describe("parsePaymentTerms — нормализация ввода", () => {
  it("пробелы и проценты убираются: ' 30 / 70 % ' → [0.3, 0.7]", () => {
    expect(parsePaymentTerms(" 30 / 70 % ")).toEqual([0.3, 0.7]);
  });

  it("проценты внутри: '30%/70%' → [0.3, 0.7]", () => {
    expect(parsePaymentTerms("30%/70%")).toEqual([0.3, 0.7]);
  });

  it("запятая как десятичный разделитель: '0,3/0,7' → [0.3, 0.7]", () => {
    expect(parsePaymentTerms("0,3/0,7")).toEqual([0.3, 0.7]);
  });

  it("разделитель дефис: '30-70' → [0.3, 0.7]", () => {
    expect(parsePaymentTerms("30-70")).toEqual([0.3, 0.7]);
  });

  it("разделитель подчёркивание: '30_70' → [0.3, 0.7]", () => {
    expect(parsePaymentTerms("30_70")).toEqual([0.3, 0.7]);
  });

  it("разделитель длинное тире: '30—70' → [0.3, 0.7]", () => {
    expect(parsePaymentTerms("30—70")).toEqual([0.3, 0.7]);
  });

  it("пустые сегменты от ведущего разделителя отфильтровываются: '/30/70' → [0.3, 0.7]", () => {
    expect(parsePaymentTerms("/30/70")).toEqual([0.3, 0.7]);
  });

  it("сдвоенный разделитель отфильтровывается: '30//70' → [0.3, 0.7]", () => {
    expect(parsePaymentTerms("30//70")).toEqual([0.3, 0.7]);
  });

  it("ведущий минус режется как разделитель: '-30/70' → [0.3, 0.7]", () => {
    // Минус трактуется не как знак числа, а как разделитель -> пустой сегмент отфильтрован.
    expect(parsePaymentTerms("-30/70")).toEqual([0.3, 0.7]);
  });
});

describe("parsePaymentTerms — доли (сумма ~1)", () => {
  it("'0.3/0.7' → [0.3, 0.7]", () => {
    expect(parsePaymentTerms("0.3/0.7")).toEqual([0.3, 0.7]);
  });

  it("'0.5/0.5' → [0.5, 0.5]", () => {
    expect(parsePaymentTerms("0.5/0.5")).toEqual([0.5, 0.5]);
  });

  it("одиночная доля '1' → [1]", () => {
    expect(parsePaymentTerms("1")).toEqual([1]);
  });

  it("доли с допуском <0.005: '0.333/0.333/0.333' (сумма 0.999) → as-is", () => {
    expect(parsePaymentTerms("0.333/0.333/0.333")).toEqual([0.333, 0.333, 0.333]);
  });
});

describe("parsePaymentTerms — одиночная полная оплата '100'", () => {
  it("'100' → [1]", () => {
    // Ловится веткой |sum-100|<0.5: 100/100 = 1.
    expect(parsePaymentTerms("100")).toEqual([1]);
  });
});

describe("parsePaymentTerms — невалидный ввод → null", () => {
  it("null → null", () => {
    expect(parsePaymentTerms(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(parsePaymentTerms(undefined)).toBeNull();
  });

  it("пустая строка → null", () => {
    expect(parsePaymentTerms("")).toBeNull();
  });

  it("строка только из пробелов → null", () => {
    expect(parsePaymentTerms("   ")).toBeNull();
  });

  it("строка только из процента → null", () => {
    expect(parsePaymentTerms("%")).toBeNull();
  });

  it("строка только из разделителей → null", () => {
    expect(parsePaymentTerms("///")).toBeNull();
  });

  it("буквенный мусор 'abc' → null", () => {
    expect(parsePaymentTerms("abc")).toBeNull();
  });

  it("частично нечисловой '30/foo' → null", () => {
    expect(parsePaymentTerms("30/foo")).toBeNull();
  });

  it("ноль среди долей '0/100' → null (n<=0)", () => {
    expect(parsePaymentTerms("0/100")).toBeNull();
  });

  it("отрицательное число без разделителя в начале не спасает: '50/-50'", () => {
    // '50/-50' -> split '/-' даёт ['50','','50'] -> filter -> ['50','50'] -> сумма 100 -> [0.5,0.5]
    expect(parsePaymentTerms("50/-50")).toEqual([0.5, 0.5]);
  });

  it("сумма не близка ни к 100, ни к 1: '60/30' (=90) → null", () => {
    expect(parsePaymentTerms("60/30")).toBeNull();
  });

  it("сумма явно мимо: '30/30' (=60) → null", () => {
    expect(parsePaymentTerms("30/30")).toBeNull();
  });

  it("сумма чуть мимо 100 за пределом допуска 0.5: '30/70.6' (=100.6) → null", () => {
    expect(parsePaymentTerms("30/70.6")).toBeNull();
  });

  it("сумма чуть мимо 1 за пределом допуска 0.005: '0.3/0.71' (=1.01) → null", () => {
    expect(parsePaymentTerms("0.3/0.71")).toBeNull();
  });
});

describe("parsePaymentTerms — границы допусков", () => {
  it("сумма 99.6 (в пределах 0.5 от 100): '29.6/70' → доли", () => {
    const r = parsePaymentTerms("29.6/70");
    expect(r).not.toBeNull();
    expect(r![0]).toBeCloseTo(0.296, 10);
    expect(r![1]).toBeCloseTo(0.7, 10);
  });

  it("сумма 1.004 (в пределах 0.005 от 1): '0.504/0.5' → as-is", () => {
    const r = parsePaymentTerms("0.504/0.5");
    expect(r).not.toBeNull();
    expect(r![0]).toBeCloseTo(0.504, 10);
    expect(r![1]).toBeCloseTo(0.5, 10);
  });
});

describe("allocatePaymentDates", () => {
  const opening = new Date("2026-01-01T00:00:00Z");
  const closing = new Date("2026-03-01T00:00:00Z"); // 59 дней спустя

  it("пустой массив долей → []", () => {
    expect(allocatePaymentDates([], opening, closing)).toEqual([]);
  });

  it("n=1 → [opening] (closing игнорируется)", () => {
    const r = allocatePaymentDates([1], opening, closing);
    expect(r).toHaveLength(1);
    expect(r[0].getTime()).toBe(opening.getTime());
  });

  it("n=2 → первая дата = opening, последняя = closing", () => {
    const r = allocatePaymentDates([0.3, 0.7], opening, closing);
    expect(r).toHaveLength(2);
    expect(r[0].getTime()).toBe(opening.getTime());
    expect(r[1].getTime()).toBe(closing.getTime());
  });

  it("n=3 → средняя дата ровно посередине между opening и closing", () => {
    const r = allocatePaymentDates([0.5, 0.3, 0.2], opening, closing);
    expect(r).toHaveLength(3);
    expect(r[0].getTime()).toBe(opening.getTime());
    expect(r[2].getTime()).toBe(closing.getTime());
    const mid = opening.getTime() + (closing.getTime() - opening.getTime()) / 2;
    expect(r[1].getTime()).toBe(mid);
  });

  it("closing=null → последняя дата = opening + 60 дней", () => {
    const r = allocatePaymentDates([0.3, 0.7], opening, null);
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
    expect(r[0].getTime()).toBe(opening.getTime());
    expect(r[1].getTime()).toBe(opening.getTime() + sixtyDaysMs);
  });

  it("closing=null, n=3 → средняя = opening + 30 дней", () => {
    const r = allocatePaymentDates([0.4, 0.3, 0.3], opening, null);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(r[1].getTime()).toBe(opening.getTime() + thirtyDaysMs);
    expect(r[2].getTime()).toBe(opening.getTime() + thirtyDaysMs * 2);
  });

  it("даты строго возрастают и лежат в [opening, closing]", () => {
    const r = allocatePaymentDates([0.25, 0.25, 0.25, 0.25], opening, closing);
    expect(r).toHaveLength(4);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].getTime()).toBeGreaterThan(r[i - 1].getTime());
      expect(r[i].getTime()).toBeGreaterThanOrEqual(opening.getTime());
      expect(r[i].getTime()).toBeLessThanOrEqual(closing.getTime());
    }
  });

  it("closing раньше opening → diff отрицательный, даты убывают (фиксируем как есть)", () => {
    // TODO: выглядит как баг — нет валидации closing < opening, даты идут назад во времени.
    const earlyClose = new Date("2025-12-01T00:00:00Z");
    const r = allocatePaymentDates([0.5, 0.5], opening, earlyClose);
    expect(r[0].getTime()).toBe(opening.getTime());
    expect(r[1].getTime()).toBe(earlyClose.getTime());
    expect(r[1].getTime()).toBeLessThan(r[0].getTime());
  });

  it("возвращает новые объекты Date, а не мутирует opening", () => {
    const localOpening = new Date("2026-01-01T00:00:00Z");
    const before = localOpening.getTime();
    allocatePaymentDates([0.3, 0.7], localOpening, closing);
    expect(localOpening.getTime()).toBe(before);
  });
});

describe("paymentLabel", () => {
  it("total=1 → 'Полная оплата'", () => {
    expect(paymentLabel(0, 1, 100)).toBe("Полная оплата 100%");
  });

  it("первый платёж (index=0, total>1) → 'Предоплата'", () => {
    expect(paymentLabel(0, 2, 30)).toBe("Предоплата 30%");
  });

  it("последний платёж (index=total-1) → 'Постоплата'", () => {
    expect(paymentLabel(1, 2, 70)).toBe("Постоплата 70%");
  });

  it("промежуточный платёж → 'Платёж N/total'", () => {
    expect(paymentLabel(1, 3, 30)).toBe("Платёж 2/3 — 30%");
  });

  it("последний из трёх → 'Постоплата'", () => {
    expect(paymentLabel(2, 3, 20)).toBe("Постоплата 20%");
  });

  it("округление до 1 знака после запятой: 33.333 → 33.3", () => {
    expect(paymentLabel(0, 2, 33.333)).toBe("Предоплата 33.3%");
  });

  it("округление 66.666 → 66.7", () => {
    expect(paymentLabel(1, 2, 66.666)).toBe("Постоплата 66.7%");
  });

  it("целое значение печатается без дробной части: 50 → 50", () => {
    expect(paymentLabel(0, 2, 50)).toBe("Предоплата 50%");
  });

  it("total=1 имеет приоритет над index=total-1", () => {
    // index=0, total=1: ветка total===1 срабатывает первой.
    expect(paymentLabel(0, 1, 100)).toBe("Полная оплата 100%");
  });
});
