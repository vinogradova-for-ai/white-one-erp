import { z } from "zod";

export const PACKAGING_TYPES = [
  "LABEL",
  "SIZE_LABEL",
  "POLYBAG",
  "MESH",
  "COVER",
  "BAG",
  "BOX",
  "CARE_LABEL",
  "OTHER",
] as const;

const decimal = z.union([z.number(), z.string()]).optional().nullable();

export const PACKAGING_STATUSES = ["IDEA", "DESIGN", "SAMPLE", "APPROVED", "ACTIVE", "ARCHIVED"] as const;

// Никаких .default() — см. комментарий в validators/model.ts.
export const packagingCreateSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(200),
  type: z.enum(PACKAGING_TYPES),
  sku: z.string().max(120).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  stock: z.number().int().min(0).optional(),
  minStock: z.number().int().min(0).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),

  // Стоимость
  unitPriceRub: decimal,
  unitPriceCny: decimal,
  priceCurrency: z.enum(["RUB", "CNY"]).optional().nullable(),
  cnyRubRate: decimal,

  // Жизненный цикл
  status: z.enum(PACKAGING_STATUSES).optional(),
  ownerId: z.string().optional().nullable(),
  decisionDate: z.string().optional().nullable(),
  designReadyDate: z.string().optional().nullable(),
  sampleRequestedDate: z.string().optional().nullable(),
  sampleApprovedDate: z.string().optional().nullable(),
  productionStartDate: z.string().optional().nullable(),
});

export const packagingUpdateSchema = packagingCreateSchema.partial();

export const packagingStatusChangeSchema = z.object({
  toStatus: z.enum(PACKAGING_STATUSES),
  comment: z.string().optional(),
});

export const orderPackagingSchema = z.object({
  packagingItemId: z.string().min(1),
  quantityPerUnit: z.union([z.number(), z.string()]).optional(),
  notes: z.string().optional().nullable(),
});
