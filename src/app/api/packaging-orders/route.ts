import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { packagingOrderCreateSchema } from "@/lib/validators/packaging-order";

async function nextPackagingOrderNumber() {
  const year = new Date().getUTCFullYear();
  const last = await prisma.packagingOrder.findFirst({
    where: { orderNumber: { startsWith: `PKG-${year}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const lastNum = last ? Number(last.orderNumber.split("-").pop()) : 0;
  return `PKG-${year}-${String(lastNum + 1).padStart(4, "0")}`;
}

function lineTotalRub(line: {
  quantity: number;
  unitPriceRub?: number | string | null;
  unitPriceCny?: number | string | null;
  priceCurrency?: "RUB" | "CNY" | null;
  cnyRubRate?: number | string | null;
}): number {
  const isCny = line.priceCurrency === "CNY";
  if (isCny && line.unitPriceCny && line.cnyRubRate) {
    return Number(line.unitPriceCny) * Number(line.cnyRubRate) * line.quantity;
  }
  if (!isCny && line.unitPriceRub) {
    return Number(line.unitPriceRub) * line.quantity;
  }
  return 0;
}

export async function GET() {
  try {
    await requireAuth();
    const items = await prisma.packagingOrder.findMany({
      orderBy: [{ orderedDate: "desc" }],
      take: 200,
      include: {
        lines: {
          include: {
            packagingItem: { select: { id: true, name: true, type: true, photoUrl: true } },
          },
        },
        factory: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const data = packagingOrderCreateSchema.parse(await req.json());

    const created = await prisma.$transaction(async (tx) => {
      // Проверяем, что все packagingItem существуют
      const itemIds = [...new Set(data.lines.map((l) => l.packagingItemId))];
      const items = await tx.packagingItem.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, name: true },
      });
      if (items.length !== itemIds.length) {
        throw new Error("Одна из упаковок не найдена");
      }
      const itemsById = new Map(items.map((i) => [i.id, i]));

      const order = await tx.packagingOrder.create({
        data: {
          orderNumber: await nextPackagingOrderNumber(),
          factoryId: data.factoryId || null,
          supplierName: data.supplierName || null,
          expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
          deliveryMethod: data.deliveryMethod || null,
          ownerId: data.ownerId,
          notes: data.notes || null,
          status: "ORDERED",
          lines: {
            create: data.lines.map((l) => {
              const isCny = l.priceCurrency === "CNY";
              return {
                packagingItemId: l.packagingItemId,
                quantity: l.quantity,
                unitPriceRub: !isCny && l.unitPriceRub ? Number(l.unitPriceRub) : null,
                unitPriceCny: isCny && l.unitPriceCny ? Number(l.unitPriceCny) : null,
                priceCurrency: l.priceCurrency || null,
                cnyRubRate: isCny && l.cnyRubRate ? Number(l.cnyRubRate) : null,
              };
            }),
          },
        },
      });

      // Платежи: либо берём график из формы, либо генерим один автоплатёж на полную сумму
      if (data.payments && data.payments.length > 0) {
        await tx.payment.createMany({
          data: data.payments.map((p) => ({
            type: "PACKAGING" as const,
            status: p.paid ? "PAID" as const : "PENDING" as const,
            paidAt: p.paid ? new Date() : null,
            paidById: p.paid ? session.user.id : null,
            plannedDate: new Date(p.plannedDate),
            amount: p.amount,
            currency: "RUB" as const,
            label: p.label,
            packagingOrderId: order.id,
            supplierName: data.supplierName || null,
            createdById: session.user.id,
          })),
        });
      } else {
        const totalRub = data.lines.reduce((sum, l) => sum + lineTotalRub(l), 0);
        if (totalRub > 0) {
          const labelParts = data.lines.slice(0, 2).map((l) => {
            const name = itemsById.get(l.packagingItemId)?.name ?? "упаковка";
            return `${name} · ${l.quantity} шт`;
          });
          const more = data.lines.length > 2 ? ` +${data.lines.length - 2}` : "";
          await tx.payment.create({
            data: {
              type: "PACKAGING",
              status: "PENDING",
              plannedDate: data.expectedDate ? new Date(data.expectedDate) : new Date(),
              amount: totalRub,
              currency: "RUB",
              label: `${labelParts.join(" · ")}${more} · ${order.orderNumber}`,
              packagingOrderId: order.id,
              supplierName: data.supplierName || null,
              createdById: session.user.id,
            },
          });
        }
      }

      return order;
    });

    return NextResponse.json(created);
  } catch (e) {
    return apiError(e);
  }
}
