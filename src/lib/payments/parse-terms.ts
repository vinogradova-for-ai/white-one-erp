// Парсер строки условий оплаты: "30/70" → [0.30, 0.70]; "50/30/20" → [0.5, 0.3, 0.2]; "100" → [1.0]
// Возвращает массив долей (сумма = 1) либо null, если не смог распарсить.

export function parsePaymentTerms(input: string | null | undefined): number[] | null {
  if (!input) return null;

  // Нормализация: убираем пробелы и процент. "30 / 70 %" → "30/70"
  const cleaned = input.replace(/\s+/g, "").replace(/%/g, "");
  if (!cleaned) return null;

  // Допускаем разделители / - — _
  const parts = cleaned.split(/[/\-_—]/).filter(Boolean);
  if (parts.length === 0) return null;

  const numbers: number[] = [];
  for (const p of parts) {
    const n = Number(p.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    numbers.push(n);
  }

  const sum = numbers.reduce((a, b) => a + b, 0);

  // Считаем что это проценты, если сумма близка к 100.
  // Если сумма в долях (~1.0) — тоже поддержим.
  let shares: number[];
  if (Math.abs(sum - 100) < 0.5) {
    shares = numbers.map((n) => n / 100);
  } else if (Math.abs(sum - 1) < 0.005) {
    shares = numbers;
  } else if (numbers.length === 1 && numbers[0] === 100) {
    shares = [1];
  } else {
    // Не проценты и не доли — не парсим
    return null;
  }

  return shares;
}

// Рассчитывает даты платежей по долям и опорным датам заказа.
// - Первая доля = предоплата → привязана к opening (дата заказа или согласования)
// - Последняя доля = постоплата → привязана к closing (дата готовности партии)
// - Промежуточные — равномерно между ними.
// Если closing не задан — откатываемся на opening + 60 дней.
export function allocatePaymentDates(
  shares: number[],
  opening: Date,
  closing: Date | null,
): Date[] {
  const n = shares.length;
  if (n === 0) return [];
  if (n === 1) return [opening];

  const closeDate = closing ?? new Date(opening.getTime() + 60 * 24 * 60 * 60 * 1000);
  const diffMs = closeDate.getTime() - opening.getTime();

  const dates: Date[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1); // 0, 0.5, 1 для n=3; 0, 1 для n=2
    dates.push(new Date(opening.getTime() + diffMs * t));
  }
  return dates;
}

// Формирует человеко-понятный лейбл платежа по индексу и общему числу долей.
export function paymentLabel(index: number, total: number, sharePct: number): string {
  const pct = Math.round(sharePct * 10) / 10;
  if (total === 1) return `Полная оплата ${pct}%`;
  if (index === 0) return `Предоплата ${pct}%`;
  if (index === total - 1) return `Постоплата ${pct}%`;
  return `Платёж ${index + 1}/${total} — ${pct}%`;
}
