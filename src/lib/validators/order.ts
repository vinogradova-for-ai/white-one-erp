import { z } from "zod";

const decimal = z.union([z.number(), z.string()]).optional().nullable();

export const orderCreateSchema = z.object({
  productVariantId: z.string().min(1, "Вариант обязателен"),
  orderType: z.enum(["SEASONAL", "RESTOCK", "TEST"]),
  season: z.string().optional().nullable(),
  launchMonth: z.number().int().min(202501).max(203012),
  quantity: z.number().int().positive("Количество > 0"),
  sizeDistribution: z.record(z.string(), z.number()).optional().nullable(),
  factoryId: z.string().optional().nullable(),
  ownerId: z.string().min(1),
  deliveryMethod: z.enum(["CARGO", "AIR", "RAIL", "DOMESTIC"]).optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  prepaymentAmount: decimal,
  finalPaymentAmount: decimal,
  packagingType: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const orderUpdateSchema = orderCreateSchema.partial();

export const orderStatusChangeSchema = z.object({
  toStatus: z.enum([
    "PREPARATION", "FABRIC_ORDERED", "SEWING", "QC", "READY_SHIP",
    "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE",
  ]),
  comment: z.string().optional(),
});

export const orderQcUpdateSchema = z.object({
  qcDate: z.string().optional().nullable(),
  qcQuantityOk: z.number().int().nonnegative().optional().nullable(),
  qcQuantityDefects: z.number().int().nonnegative().optional().nullable(),
  qcDefectsPhotoUrl: z.string().url().optional().nullable().or(z.literal("")),
  qcDefectCategory: z.enum(["SEWING", "FABRIC", "FITTINGS", "SIZE", "OTHER"]).optional().nullable(),
  qcReplacedByFactory: z.boolean().optional(),
  qcResolutionNote: z.string().optional().nullable(),
});

export const orderSizeActualSchema = z.object({
  sizeDistributionActual: z.record(z.string(), z.number()),
});
