// Чистая доменная логика партий/приёмки — без БД и сети.
// Тестируется юнитами (batch-logic.test.ts).

/** Позиция линии заказа для построения партии (цвет + размерная матрица). */
export type OrderLineForBatch = {
  productVariantId: string;
  colorName: string;
  quantity: number;
  /** { "42": 50, "44": 120, ... } — план по размерам. Может быть null. */
  sizeDistribution: Record<string, number> | null | undefined;
};

/** Позиция будущей партии (до записи в БД). */
export type BatchItemDraft = {
  variantId: string;
  colorName: string;
  size: string;
  plannedQty: number;
};

/**
 * Разворачивает линии заказа в позиции ОДНОЙ партии (обычный случай — весь заказ
 * едет одной партией). Если у линии есть размерная матрица — по строке на размер;
 * если матрицы нет — одна строка с size "—" и полным количеством линии.
 * Нулевые количества пропускаем.
 */
export function buildFullBatchItems(lines: OrderLineForBatch[]): BatchItemDraft[] {
  const items: BatchItemDraft[] = [];
  for (const line of lines) {
    const dist = line.sizeDistribution;
    if (dist && Object.keys(dist).length > 0) {
      for (const [size, qty] of Object.entries(dist)) {
        const n = Number(qty) || 0;
        if (n <= 0) continue;
        items.push({ variantId: line.productVariantId, colorName: line.colorName, size, plannedQty: n });
      }
    } else if (line.quantity > 0) {
      items.push({
        variantId: line.productVariantId,
        colorName: line.colorName,
        size: "—",
        plannedQty: line.quantity,
      });
    }
  }
  return items;
}

/** Итог приёмки по набору позиций партии. */
export type ReceiptTotals = {
  /** План — сумма plannedQty. */
  planned: number;
  /** Принято годного — сумма factQty (null трактуем как 0). */
  received: number;
  /** Брак — сумма defectQty. */
  defect: number;
  /** Недостача = planned − received − defect (не меньше 0). */
  shortage: number;
  /** Годных принято = received − defect (не меньше 0). */
  good: number;
};

export type BatchItemForTotals = {
  plannedQty: number;
  factQty?: number | null;
  defectQty?: number | null;
};

/**
 * Агрегация факт/брак/недостача по позициям партии.
 * factQty — сколько всего пришло (включая бракованные); defectQty — сколько
 * из них с браком; годных = factQty − defectQty. Недостача = план − пришло.
 */
export function aggregateReceipt(items: BatchItemForTotals[]): ReceiptTotals {
  let planned = 0;
  let received = 0;
  let defect = 0;
  for (const it of items) {
    planned += it.plannedQty || 0;
    received += it.factQty ?? 0;
    defect += it.defectQty ?? 0;
  }
  const shortage = Math.max(0, planned - received);
  const good = Math.max(0, received - defect);
  return { planned, received, defect, shortage, good };
}

/**
 * Все ли партии заказа приняты (receivedAt проставлен у каждой).
 * Заказ без партий — не «принят» (false), это ещё не поставочный кейс.
 */
export function allBatchesReceived(batches: Array<{ receivedAt: Date | null }>): boolean {
  if (batches.length === 0) return false;
  return batches.every((b) => b.receivedAt != null);
}

/**
 * Все ли партии заказа уехали или уже приняты — сигнал перевести заказ в
 * IN_TRANSIT. Партия «уехала», если у неё проставлен shipmentDeparted (её
 * поставка выехала) ИЛИ она уже принята.
 */
export function allBatchesShippedOrReceived(
  batches: Array<{ receivedAt: Date | null; shipmentDeparted: boolean }>,
): boolean {
  if (batches.length === 0) return false;
  return batches.every((b) => b.receivedAt != null || b.shipmentDeparted);
}

/**
 * Разбиение партии: сколько единиц каждой позиции ОСТАЁТСЯ в исходной партии.
 * split[itemId] = сколько уезжает в НОВОЙ партии; остаток (planned − split)
 * остаётся в исходной. Возвращает две карты: keep (исходная) и move (новая).
 * Позиции, у которых move = 0, в новую не попадают; где keep = 0 — вычищаются
 * из исходной (вызывающий удалит нулевые). move не может превышать planned.
 */
export function splitBatchPlan(
  items: Array<{ id: string; plannedQty: number }>,
  moveQty: Record<string, number>,
): { keep: Record<string, number>; move: Record<string, number> } {
  const keep: Record<string, number> = {};
  const move: Record<string, number> = {};
  for (const it of items) {
    const raw = moveQty[it.id] ?? 0;
    const m = Math.max(0, Math.min(it.plannedQty, Math.floor(raw)));
    move[it.id] = m;
    keep[it.id] = it.plannedQty - m;
  }
  return { keep, move };
}

/**
 * Пропорциональная нарезка: сколько штук каждой позиции уезжает, если из
 * общего остатка едет take штук (Алёна, прожарка 17.07: «сколько едет этим
 * карго?» — партия рождается в момент прикрепления, позиции делим
 * пропорционально, точную нарезку по цветам/размерам можно поправить ручным
 * разбиением). Метод наибольших остатков: сумма всегда сходится ровно в take.
 */
export function proportionalTake(
  items: Array<{ id: string; plannedQty: number }>,
  take: number,
): Record<string, number> {
  const total = items.reduce((a, i) => a + i.plannedQty, 0);
  const out: Record<string, number> = {};
  if (take <= 0 || total <= 0) {
    for (const i of items) out[i.id] = 0;
    return out;
  }
  if (take >= total) {
    for (const i of items) out[i.id] = i.plannedQty;
    return out;
  }
  // Целая часть + дробные остатки
  const fractions: Array<{ id: string; frac: number; cap: number }> = [];
  let allocated = 0;
  for (const i of items) {
    const exact = (take * i.plannedQty) / total;
    const base = Math.floor(exact);
    out[i.id] = base;
    allocated += base;
    fractions.push({ id: i.id, frac: exact - base, cap: i.plannedQty });
  }
  // Добираем недостающее по наибольшим дробям (не превышая позицию)
  fractions.sort((a, b) => b.frac - a.frac);
  let left = take - allocated;
  for (const f of fractions) {
    if (left <= 0) break;
    if (out[f.id] < f.cap) {
      out[f.id] += 1;
      left -= 1;
    }
  }
  // Крайний случай: у кого-то ещё есть ёмкость
  if (left > 0) {
    for (const i of items) {
      while (left > 0 && out[i.id] < i.plannedQty) {
        out[i.id] += 1;
        left -= 1;
      }
    }
  }
  return out;
}
