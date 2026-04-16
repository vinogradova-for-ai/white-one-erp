import { z } from "zod";

export const ideaCreateSchema = z.object({
  title: z.string().min(1, "Название обязательно").max(300),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
});

export const ideaUpdateSchema = ideaCreateSchema.partial().extend({
  status: z.enum(["NEW", "CONSIDERING", "PROMOTED", "REJECTED"]).optional(),
  rejectedReason: z.string().optional().nullable(),
});
