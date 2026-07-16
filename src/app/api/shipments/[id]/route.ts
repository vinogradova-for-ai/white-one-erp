import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { shipmentUpdateSchema } from "@/lib/validators/shipment";
import { logAudit } from "@/server/audit";
import { getCbrRate } from "@/server/currency-rates";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const { id } = await ctx.params;
    const data = shipmentUpdateSchema.parse(await req.json());

    const existing = await prisma.shipment.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      return NextResponse.json({ error: { code: "not_found", message: "Поставка не найдена" } }, { status: 404 });
    }

    // Фиксация курса в момент оплаты карго (Алёна 16.07): поставили дату
    // оплаты — курс USD ЦБ этого дня замирает в usdRubRate; сняли оплату —
    // фиксация снимается, раскидка снова считается по курсу «на сегодня».
    let usdRubRatePatch: { usdRubRate: number | null } | Record<string, never> = {};
    if (data.cargoPaidAt !== undefined) {
      const nextPaidAt = data.cargoPaidAt ? new Date(data.cargoPaidAt) : null;
      if (nextPaidAt == null) {
        usdRubRatePatch = { usdRubRate: null };
      } else if (
        existing.cargoPaidAt?.getTime() !== nextPaidAt.getTime() ||
        existing.usdRubRate == null
      ) {
        try {
          usdRubRatePatch = { usdRubRate: await getCbrRate("USD", nextPaidAt) };
        } catch {
          // ЦБ недоступен — сохранение не роняем; курс зафиксируется при
          // следующем сохранении оплаты, до тех пор раскидка «предварительная».
        }
      }
    }

    const shipment = await prisma.shipment.update({
      where: { id },
      data: {
        ...(data.carrier !== undefined ? { carrier: data.carrier } : {}),
        ...(data.comment !== undefined ? { comment: data.comment } : {}),
        ...(data.departDate !== undefined ? { departDate: data.departDate ? new Date(data.departDate) : null } : {}),
        ...(data.arriveDate !== undefined ? { arriveDate: data.arriveDate ? new Date(data.arriveDate) : null } : {}),
        // Карго-накладная (лист «КАРГО»)
        ...(data.cargoNumber !== undefined ? { cargoNumber: data.cargoNumber || null } : {}),
        ...(data.placesCount !== undefined ? { placesCount: data.placesCount } : {}),
        ...(data.weightKg !== undefined ? { weightKg: data.weightKg } : {}),
        ...(data.amountUsdt !== undefined ? { amountUsdt: data.amountUsdt } : {}),
        ...(data.cargoPaidAt !== undefined ? { cargoPaidAt: data.cargoPaidAt ? new Date(data.cargoPaidAt) : null } : {}),
        ...(data.arrivalActualDate !== undefined ? { arrivalActualDate: data.arrivalActualDate ? new Date(data.arrivalActualDate) : null } : {}),
        // Деньги накладной раздельно + фото накладной + курс оплаты
        ...(data.freightUsd !== undefined ? { freightUsd: data.freightUsd } : {}),
        ...(data.insuranceUsd !== undefined ? { insuranceUsd: data.insuranceUsd } : {}),
        ...(data.packingFeeUsd !== undefined ? { packingFeeUsd: data.packingFeeUsd } : {}),
        ...(data.waybillPhotoUrls !== undefined ? { waybillPhotoUrls: data.waybillPhotoUrls } : {}),
        ...usdRubRatePatch,
      },
    });

    await logAudit({
      action: "UPDATE",
      entityType: "Shipment",
      entityId: id,
      userId: session.user.id,
      changes: data,
    });

    return NextResponse.json({ shipment });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    // Мягкое удаление поставки — только OWNER/DIRECTOR.
    assertCan(session.user.role, "shipment.delete");
    const { id } = await ctx.params;

    const existing = await prisma.shipment.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      return NextResponse.json({ error: { code: "not_found", message: "Поставка не найдена" } }, { status: 404 });
    }

    // Отвязываем партии от поставки (SetNull) и мягко гасим поставку.
    await prisma.$transaction(async (tx) => {
      await tx.orderBatch.updateMany({ where: { shipmentId: id }, data: { shipmentId: null } });
      await tx.shipment.update({ where: { id }, data: { deletedAt: new Date() } });
    });

    await logAudit({
      action: "DELETE",
      entityType: "Shipment",
      entityId: id,
      userId: session.user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
