import { z } from "zod";

export const SHIPMENT_STATUSES = ["DRAFT", "IN_TRANSIT", "ARRIVED", "RECEIVED"] as const;

// Создание/правка поставки — шапка. Партии добавляются отдельными эндпоинтами.
export const shipmentCreateSchema = z.object({
  carrier: z.string().max(200).optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
  departDate: z.string().optional().nullable(),
  arriveDate: z.string().optional().nullable(),
});

export const shipmentUpdateSchema = shipmentCreateSchema.partial();

export const shipmentStatusChangeSchema = z.object({
  status: z.enum(SHIPMENT_STATUSES),
});

// Добавить заказ в поставку — партия создаётся лениво, если её ещё нет.
export const shipmentAddOrderSchema = z.object({
  orderId: z.string().min(1),
});

// Убрать партию из поставки.
export const shipmentRemoveBatchSchema = z.object({
  batchId: z.string().min(1),
});

// Разбить партию: сколько единиц каждой позиции УЕЗЖАЕТ в новую партию
// (остаток остаётся в исходной, новая — без поставки).
export const batchSplitSchema = z.object({
  // { batchItemId: qtyToMove }
  move: z.record(z.string(), z.number().int().min(0)),
});

// Приёмка: правка факта/брака по строкам партии + добавление новой строки.
export const batchReceiptItemSchema = z.object({
  // id существующей строки (правим) либо отсутствует (новая строка руками)
  id: z.string().optional(),
  variantId: z.string().optional().nullable(),
  colorName: z.string().min(1).max(200),
  size: z.string().min(1).max(50),
  plannedQty: z.number().int().min(0),
  factQty: z.number().int().min(0).optional().nullable(),
  defectQty: z.number().int().min(0).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

export const batchReceiptSchema = z.object({
  items: z.array(batchReceiptItemSchema),
  // Удалённые строки (id) — например, ошибочно добавленная руками.
  deletedItemIds: z.array(z.string()).optional(),
});
