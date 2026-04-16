import { z } from "zod";

const decimal = z.union([z.number(), z.string()]).optional().nullable();

export const productCreateSchema = z.object({
  sku: z.string().min(1, "Артикул обязателен").max(120),
  name: z.string().min(1, "Название обязательно").max(300),
  brand: z.enum(["WHITE_ONE", "SERDCEBIENIE"]),
  developmentType: z.enum(["OWN", "REPEAT"]).default("OWN"),
  category: z.string().min(1, "Категория обязательна"),
  subcategory: z.string().optional().nullable(),
  color: z.string().min(1, "Цвет обязателен"),
  fabric: z.string().optional().nullable(),
  sizeChart: z.string().optional().nullable(),
  hsCode: z.string().optional().nullable(),
  preferredFactoryId: z.string().optional().nullable(),
  countryOfOrigin: z.string().min(1, "Страна производства обязательна"),
  packagingType: z.string().optional().nullable(),

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
  factRedemptionPct: decimal,

  lengthCm: decimal,
  widthCm: decimal,
  heightCm: decimal,
  weightG: z.number().int().optional().nullable(),
  liters: decimal,

  ownerId: z.string().min(1, "Ответственный обязателен"),
  plannedLaunchMonth: z.number().int().min(202501).max(203012).optional().nullable(),

  patternsUrl: z.string().url().optional().nullable().or(z.literal("")),
  techDocsUrl: z.string().url().optional().nullable().or(z.literal("")),
  sampleUrl: z.string().url().optional().nullable().or(z.literal("")),
  photoUrls: z.array(z.string().url()).optional().default([]),
  notes: z.string().optional().nullable(),
});

export const productUpdateSchema = productCreateSchema.partial();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const productStatusChangeSchema = z.object({
  toStatus: z.enum([
    "IDEA",
    "SKETCH",
    "PATTERNS",
    "SAMPLE",
    "CORRECTIONS",
    "SIZE_CHART",
    "APPROVED",
    "READY_FOR_PRODUCTION",
  ]),
  comment: z.string().optional(),
});
