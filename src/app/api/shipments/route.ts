import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { shipmentCreateSchema } from "@/lib/validators/shipment";
import { logAudit } from "@/server/audit";

async function nextShipmentNumber() {
  const year = new Date().getUTCFullYear();
  const last = await prisma.shipment.findFirst({
    where: { number: { startsWith: `SHP-${year}-` } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const lastNum = last ? Number(last.number.split("-").pop()) : 0;
  return `SHP-${year}-${String(lastNum + 1).padStart(4, "0")}`;
}

export async function GET() {
  try {
    await requireAuth();
    const shipments = await prisma.shipment.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: {
        createdBy: { select: { name: true } },
        batches: {
          select: {
            orderId: true,
            items: { select: { plannedQty: true } },
          },
        },
      },
    });
    return NextResponse.json({ shipments });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "shipment.manage");
    const data = shipmentCreateSchema.parse(await req.json());

    const number = await nextShipmentNumber();
    const shipment = await prisma.shipment.create({
      data: {
        number,
        carrier: data.carrier ?? null,
        comment: data.comment ?? null,
        departDate: data.departDate ? new Date(data.departDate) : null,
        arriveDate: data.arriveDate ? new Date(data.arriveDate) : null,
        // Карго-накладная (лист «КАРГО») — можно завести сразу при создании
        cargoNumber: data.cargoNumber ?? null,
        placesCount: data.placesCount ?? null,
        weightKg: data.weightKg ?? null,
        amountUsdt: data.amountUsdt ?? null,
        cargoPaidAt: data.cargoPaidAt ? new Date(data.cargoPaidAt) : null,
        arrivalActualDate: data.arrivalActualDate ? new Date(data.arrivalActualDate) : null,
        createdById: session.user.id,
      },
    });

    await logAudit({
      action: "CREATE",
      entityType: "Shipment",
      entityId: shipment.id,
      userId: session.user.id,
      changes: { number },
    });

    return NextResponse.json({ shipment });
  } catch (e) {
    return apiError(e);
  }
}
