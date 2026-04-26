import { z } from "zod";

const decimal = z.union([z.number(), z.string()]).optional().nullable();

export const PRODUCT_VARIANT_STATUSES = ["DRAFT", "READY_TO_ORDER", "DISCONTINUED"] as const;

export const variantCreateSchema = z.object({
  productModelId: z.string().min(1),
  sku: z.string().min(1, "Артикул обязателен").max(120),
  colorName: z.string().min(1, "Цвет обязателен"),
  fabricColorCode: z.string().optional().nullable(),

  photoUrls: z.array(z.string().url()).optional(),

  status: z.enum(PRODUCT_VARIANT_STATUSES).optional(),

  // Все эти поля опциональны при создании — заполняются позже на странице редактирования.
  defaultSizeProportion: z.record(z.string(), z.number()).optional().nullable(),
  factRedemptionPct: decimal,
  lengthCm: decimal,
  widthCm: decimal,
  heightCm: decimal,
  weightG: z.number().int().optional().nullable(),
  liters: decimal,
  packagingType: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const variantUpdateSchema = variantCreateSchema.partial().omit({ productModelId: true });
