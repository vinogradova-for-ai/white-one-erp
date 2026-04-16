import { z } from "zod";

export const sampleCreateSchema = z.object({
  productModelId: z.string().min(1),
  productVariantId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const sampleStatusChangeSchema = z.object({
  toStatus: z.enum(["REQUESTED", "IN_SEWING", "DELIVERED", "APPROVED", "READY_FOR_SHOOT", "RETURNED"]),
  comment: z.string().optional(),
  approvalComment: z.string().optional(),
  approvedPhotoUrl: z.string().url().optional().nullable().or(z.literal("")),
});

export const sampleUpdateSchema = z.object({
  plannedShootDate: z.string().optional().nullable(),
  shootCompleted: z.boolean().optional(),
  photoUrls: z.array(z.string().url()).optional(),
  notes: z.string().optional().nullable(),
});
