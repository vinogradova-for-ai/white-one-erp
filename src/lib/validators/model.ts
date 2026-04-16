import { z } from "zod";

const decimal = z.union([z.number(), z.string()]).optional().nullable();

export const modelCreateSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(300),
  category: z.string().min(1, "Категория обязательна"),
  subcategory: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  sizeGridId: z.string().optional().nullable(),
  countryOfOrigin: z.string().min(1, "Страна производства обязательна"),
  preferredFactoryId: z.string().optional().nullable(),
  developmentType: z.enum(["OWN", "REPEAT"]).default("OWN"),
  isRepeat: z.boolean().default(false),
  previousVersionId: z.string().optional().nullable(),

  fabricName: z.string().optional().nullable(),
  fabricConsumption: decimal,
  fabricPricePerMeter: decimal,
  fabricCurrency: z.enum(["RUB", "CNY"]).optional().nullable(),

  patternsUrl: z.string().url().optional().nullable().or(z.literal("")),
  patternVersion: z.string().optional().nullable(),
  techPackUrl: z.string().url().optional().nullable().or(z.literal("")),
  sampleApprovalUrl: z.string().url().optional().nullable().or(z.literal("")),
  photoUrls: z.array(z.string().url()).optional().default([]),

  ownerId: z.string().min(1, "Ответственный обязателен"),
  plannedLaunchMonth: z.number().int().min(202501).max(203012).optional().nullable(),

  correctionsNeeded: z.boolean().default(false),
  sizeChartReady: z.boolean().default(false),

  notes: z.string().optional().nullable(),
});

export const modelUpdateSchema = modelCreateSchema.partial();
export type ModelCreateInput = z.infer<typeof modelCreateSchema>;

export const modelStatusChangeSchema = z.object({
  toStatus: z.enum(["IDEA", "PATTERNS", "SAMPLE", "APPROVED", "IN_PRODUCTION"]),
  comment: z.string().optional(),
});
