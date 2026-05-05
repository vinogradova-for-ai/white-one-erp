import { z } from "zod";

export const PACKAGING_ORDER_STATUSES = [
  "ORDERED",
  "IN_PRODUCTION",
  "IN_TRANSIT",
  "ARRIVED",
  "CANCELLED",
] as const;

const dec = z.union([z.number(), z.string()]).optional().nullable();

export const packagingOrderLineSchema = z.object({
  packagingItemId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceRub: dec,
  unitPriceCny: dec,
  priceCurrency: z.enum(["RUB", "CNY"]).optional().nullable(),
  cnyRubRate: dec,
});

const deliveryMethod = z
  .enum(["DOMESTIC_RU", "CARGO_KG", "CARGO_CN", "TK_CN"])
  .optional()
  .nullable();

const paymentInput = z.object({
  plannedDate: z.string(),
  amount: z.number(),
  label: z.string(),
  paid: z.boolean().optional(),
});

export const packagingOrderCreateSchema = z.object({
  factoryId: z.string().optional().nullable(),
  supplierName: z.string().max(200).optional().nullable(),
  productionEndDate: z.string().optional().nullable(),
  expectedDate: z.string().optional().nullable(),
  ownerId: z.string().min(1),
  notes: z.string().max(2000).optional().nullable(),
  deliveryMethod,
  lines: z.array(packagingOrderLineSchema).min(1, "Нужна хотя бы одна позиция"),
  payments: z.array(paymentInput).optional(),
});

export const packagingOrderUpdateSchema = z.object({
  factoryId: z.string().optional().nullable(),
  supplierName: z.string().max(200).optional().nullable(),
  orderedDate: z.string().optional().nullable(),
  productionEndDate: z.string().optional().nullable(),
  expectedDate: z.string().optional().nullable(),
  ownerId: z.string().optional(),
  notes: z.string().max(2000).optional().nullable(),
  deliveryMethod,
  status: z.enum(PACKAGING_ORDER_STATUSES).optional(),
  arrivedDate: z.string().optional().nullable(),
  lines: z.array(packagingOrderLineSchema).optional(),
  payments: z.array(paymentInput).optional(),
});

export type PackagingOrderLineInput = z.infer<typeof packagingOrderLineSchema>;
export type PackagingOrderCreateInput = z.infer<typeof packagingOrderCreateSchema>;
