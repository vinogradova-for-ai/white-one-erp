import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { adjustPackagingStock } from "@/server/packaging-stock";
import { logAudit } from "@/server/audit";

// Массовая инвентаризация упаковки: девочки вводят факт по позициям,
// пустое поле = склад не пересчитывали (не трогаем). Каждый пересчёт —
// ЯКОРЬ: от него учёт строится заново (Алёна 17.07).
const schema = z.object({
  note: z.string().max(300).optional().nullable(),
  rows: z
    .array(
      z.object({
        packagingItemId: z.string().min(1),
        cn: z.number().int().min(0).optional().nullable(),
        msk: z.number().int().min(0).optional().nullable(),
      }),
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "packaging.manage");
    const data = schema.parse(await req.json());

    let applied = 0;
    for (const r of data.rows) {
      if (r.cn != null) {
        await adjustPackagingStock({
          packagingItemId: r.packagingItemId,
          warehouse: "CN",
          actualQty: r.cn,
          note: data.note ?? "массовая инвентаризация",
          actorId: session.user.id,
        });
        applied++;
      }
      if (r.msk != null) {
        await adjustPackagingStock({
          packagingItemId: r.packagingItemId,
          warehouse: "MSK",
          actualQty: r.msk,
          note: data.note ?? "массовая инвентаризация",
          actorId: session.user.id,
        });
        applied++;
      }
    }

    await logAudit({
      action: "UPDATE",
      entityType: "PackagingItem",
      entityId: "inventory-bulk",
      userId: session.user.id,
      changes: { applied },
    });

    return NextResponse.json({ ok: true, applied });
  } catch (e) {
    return apiError(e);
  }
}
