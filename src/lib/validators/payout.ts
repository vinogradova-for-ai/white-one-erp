import { z } from "zod";

// Валидатор создания «Оплаты фабрике» с разнесением по плановым платежам.
const num = z.union([z.number(), z.string()]).transform((v) => Number(v)).pipe(z.number());

export const payoutAllocationInputSchema = z.object({
  paymentId: z.string().min(1),
  amount: num.pipe(z.number().nonnegative()),
});

export const payoutCreateSchema = z.object({
  date: z.string().min(1, "Укажите дату оплаты"),
  factoryId: z.string().min(1, "Выберите фабрику"),
  amount: num.pipe(z.number().positive("Сумма должна быть больше нуля")),
  currencyNote: z.string().max(100).optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
  // Разнесения: только строки с суммой > 0. Пустой массив допустим —
  // тогда вся сумма числится нераспределённой на оплате.
  allocations: z.array(payoutAllocationInputSchema).default([]),
});

export type PayoutCreateInput = z.infer<typeof payoutCreateSchema>;
