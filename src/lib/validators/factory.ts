import { z } from "zod";

export const factoryCreateSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(200),
  country: z.string().min(1, "Страна обязательна").max(100),
  city: z.string().max(100).optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  contactInfo: z.string().max(500).optional().nullable(),
  capacityPerMonth: z.number().int().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const factoryUpdateSchema = factoryCreateSchema.partial();
