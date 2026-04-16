import { z } from "zod";

const decimal = z.union([z.number(), z.string()]).optional().nullable();

export const variantCreateSchema = z.object({
  productModelId: z.string().min(1),
  sku: z.string().min(1, "Артикул обязателен").max(120),
  colorName: z.string().min(1, "Цвет обязателен"),
  pantoneCode: z.string().optional().nullable(),

  // Фото — КРИТИЧНО: минимум 1
  photoUrls: z.array(z.string().url()).min(1, "Нужна хотя бы одна фотография"),

  defaultSizeProportion: z.record(z.string(), z.number()).optional().nullable(),

  purchasePriceCny: decimal,
  purchasePriceRub: decimal,
  cnyRubRate: decimal,
  packagingCost: decimal,
  wbLogisticsCost: decimal,
  wbPrice: decimal,
  customerPrice: decimal,
  wbCommissionPct: decimal,
  drrPct: decimal,
  plannedRedemptionPct: decimal,

  lengthCm: decimal,
  widthCm: decimal,
  heightCm: decimal,
  weightG: z.number().int().optional().nullable(),
  liters: decimal,

  hsCode: z.string().optional().nullable(),
  packagingType: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const variantUpdateSchema = variantCreateSchema.partial().omit({ productModelId: true });
