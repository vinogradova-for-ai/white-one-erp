import { z } from "zod";

// NB: без .default() в create-схеме — partial для PATCH ниже.
export const paymentCreateSchema = z.object({
  type: z.enum(["ORDER", "PACKAGING"]),
  plannedDate: z.string().min(1, "Укажите плановую дату"),
  amount: z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number().nonnegative()),
  currency: z.enum(["RUB", "CNY"]).optional(),
  label: z.string().min(1, "Название платежа обязательно").max(200),
  invoiceUrl: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),

  orderId: z.string().optional().nullable(),
  factoryId: z.string().optional().nullable(),
  packagingItemId: z.string().optional().nullable(),
  supplierName: z.string().optional().nullable(),
});

export const paymentUpdateSchema = paymentCreateSchema.partial();

export const paymentMarkPaidSchema = z.object({
  paidAt: z.string().optional(), // ISO, по умолчанию — сегодня
});

// Массовая отметка «оплачено» для выбранных платежей (чекбоксы в «Предстоящих»).
export const paymentMarkPaidBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Выберите хотя бы один платёж"),
  paidAt: z.string().optional(), // ISO, по умолчанию — сегодня
});
