import { z } from "zod";

// «Планирование» — направления развития бренда (BrandPlan).
// Денежные/числовые поля приходят строками из формы — приводим и чистим.

export const BRAND_PLAN_STATUSES = ["IDEA", "APPROVED", "IN_PROGRESS", "DONE", "CANCELLED"] as const;

export const BRAND_PLAN_STATUS_LABELS: Record<(typeof BRAND_PLAN_STATUSES)[number], string> = {
  IDEA: "Идея",
  APPROVED: "Идём",
  IN_PROGRESS: "В работе",
  DONE: "Запущено",
  CANCELLED: "Не идём",
};

export const BRAND_PLAN_STATUS_COLORS: Record<(typeof BRAND_PLAN_STATUSES)[number], string> = {
  IDEA: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
  APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
  DONE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300",
  CANCELLED: "bg-slate-100 text-slate-400 dark:bg-slate-400/10 dark:text-slate-400",
};

const intField = z
  .union([z.number().int().min(0), z.string()])
  .transform((v) => {
    if (typeof v === "number") return v;
    const t = v.trim();
    if (!t) return null;
    const n = parseInt(t, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  })
  .nullable()
  .optional();

const decimalField = z
  .union([z.number().min(0), z.string()])
  .transform((v) => {
    if (typeof v === "number") return v;
    const t = v.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  })
  .nullable()
  .optional();

export const brandPlanCreateSchema = z.object({
  name: z.string().trim().min(1, "Название обязательно"),
  status: z.enum(BRAND_PLAN_STATUSES).optional(),
  season: z.string().trim().optional(),
  targetDate: z.string().trim().optional(), // ISO или пусто
  plannedModelsCount: intField,
  plannedUnitsPerModel: intField,
  targetUnitPriceCny: decimalField,
  cnyRubRate: decimalField,
  budgetRub: decimalField,
  notes: z.string().trim().optional(),
  ownerId: z.string().trim().optional(),
});

// ⚠️ Без .default() при .partial() (грабля №1) — здесь дефолтов нет.
export const brandPlanUpdateSchema = brandPlanCreateSchema.partial();

export type BrandPlanCreateInput = z.infer<typeof brandPlanCreateSchema>;
