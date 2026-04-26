import { z } from "zod";

export const orderLineInputSchema = z.object({
  productVariantId: z.string().min(1, "Вариант обязателен"),
  quantity: z.number().int().positive("Количество > 0"),
  sizeDistribution: z.record(z.string(), z.number()).optional().nullable(),
});

export const orderPaymentInputSchema = z.object({
  plannedDate: z.string().min(1, "Дата обязательна"),
  amount: z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number().nonnegative()),
  label: z.string().min(1, "Название платежа").max(200),
});

export const orderCreateSchema = z.object({
  productModelId: z.string().min(1, "Фасон обязателен"),
  lines: z.array(orderLineInputSchema).min(1, "Нужна хотя бы одна позиция"),
  orderType: z.enum(["SEASONAL", "RESTOCK", "TEST"]),
  season: z.string().optional().nullable(),
  launchMonth: z.number().int().min(202501).max(203012),
  factoryId: z.string().optional().nullable(),
  ownerId: z.string().min(1),
  deliveryMethod: z.enum(["CARGO", "AIR", "RAIL", "DOMESTIC"]).optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  packagingType: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Стоимость одной единицы в рублях — переопределяет fullCost с фасона для этого заказа.
  unitCost: z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number().positive()).optional(),
  // Если передан — используем как график платежей вместо авто-парсинга paymentTerms.
  payments: z.array(orderPaymentInputSchema).optional(),

  // Таймлайн — примерные даты этапов
  handedToFactoryDate: z.string().optional().nullable(),
  sewingStartDate: z.string().optional().nullable(),
  readyAtFactoryDate: z.string().optional().nullable(),
  qcDate: z.string().optional().nullable(),
  shipmentDate: z.string().optional().nullable(),
  arrivalPlannedDate: z.string().optional().nullable(),
  packingDoneDate: z.string().optional().nullable(),
  wbShipmentDate: z.string().optional().nullable(),
  saleStartDate: z.string().optional().nullable(),
});

// PATCH для шапки заказа. Без lines — ими управляют отдельными ручками.
export const orderUpdateSchema = orderCreateSchema.partial().omit({ lines: true, productModelId: true });

// Отдельные схемы для работы с позициями
export const orderLineAddSchema = orderLineInputSchema;
export const orderLineUpdateSchema = z.object({
  quantity: z.number().int().positive().optional(),
  sizeDistribution: z.record(z.string(), z.number()).optional().nullable(),
  sizeDistributionActual: z.record(z.string(), z.number()).optional().nullable(),
});

export const orderStatusChangeSchema = z.object({
  toStatus: z.enum([
    "PREPARATION", "FABRIC_ORDERED", "SEWING", "QC", "READY_SHIP",
    "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE",
  ]),
  comment: z.string().optional(),
});

