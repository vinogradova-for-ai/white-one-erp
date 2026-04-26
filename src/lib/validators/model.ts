import { z } from "zod";

const decimal = z.union([z.number(), z.string()]).optional().nullable();

// ВАЖНО: никаких .default() — мы используем partial() для updateSchema,
// и дефолты Zod применились бы при каждом PATCH, обнуляя поля, которых клиент не прислал.
// Дефолты выставляются на стороне create-роута или формы.
export const modelCreateSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(300),
  brand: z.enum(["WHITE_ONE", "SERDCEBIENIE"]).optional(),
  category: z.string().min(1, "Категория обязательна"),
  subcategory: z.string().optional().nullable(),
  sizeGridId: z.string().optional().nullable(),
  countryOfOrigin: z.string().min(1, "Страна производства обязательна"),
  preferredFactoryId: z.string().optional().nullable(),
  developmentType: z.enum(["OWN", "REPEAT"]).optional(),
  isRepeat: z.boolean().optional(),
  previousVersionId: z.string().optional().nullable(),

  turnkeyPurchase: z.boolean().optional(),
  fabricName: z.string().optional().nullable(),
  fabricComposition: z.string().optional().nullable(),
  fabricConsumption: decimal,
  fabricPricePerMeter: decimal,
  fabricCurrency: z.enum(["RUB", "CNY"]).optional().nullable(),

  // Таргет себестоимости (прогноз на этапе разработки)
  targetCostRub: decimal,
  targetCostCny: decimal,
  targetCostNote: z.string().optional().nullable(),

  // Экономика — одна для всех цветов фасона
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

  patternsUrl: z.string().url().optional().nullable().or(z.literal("")),
  photoUrls: z.array(z.string().url()).optional(),

  // Пропорция размеров по умолчанию для всех цветов фасона.
  defaultSizeProportion: z.record(z.string(), z.number()).optional().nullable(),

  ownerId: z.string().min(1, "Ответственный обязателен"),
  plannedLaunchMonth: z.number().int().min(202501).max(203012).optional().nullable(),

  correctionsNeeded: z.boolean().optional(),
  sizeChartReady: z.boolean().optional(),

  notes: z.string().optional().nullable(),
});

export const modelUpdateSchema = modelCreateSchema.partial();
export type ModelCreateInput = z.infer<typeof modelCreateSchema>;

export const modelStatusChangeSchema = z.object({
  toStatus: z.enum(["IDEA", "PATTERNS", "SAMPLE", "APPROVED", "IN_PRODUCTION"]),
  comment: z.string().optional(),
});
