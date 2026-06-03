import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { orderCreateSchema } from "@/lib/validators/order";
import { calculateOrderEconomics } from "@/lib/calculations/product-cost";
import { generatePaymentsForOrder } from "@/lib/payments/generate-for-order";
import { fillMissingOrderDates } from "@/lib/normalize-phase-dates";
import { logAudit } from "@/server/audit";

async function nextOrderNumber(client: Prisma.TransactionClient = prisma) {
  const year = new Date().getUTCFullYear();
  const last = await client.order.findFirst({
    where: { orderNumber: { startsWith: `ORD-${year}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const lastNum = last ? Number(last.orderNumber.split("-").pop()) : 0;
  return `ORD-${year}-${String(lastNum + 1).padStart(4, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "order.create");
    const data = orderCreateSchema.parse(await req.json());

    // Загружаем фасон со всеми вариантами и комплектом упаковки
    const model = await prisma.productModel.findFirst({
      where: { id: data.productModelId, deletedAt: null },
      include: {
        variants: { where: { deletedAt: null } },
        packagingItems: true,
      },
    });
    if (!model) {
      return NextResponse.json({ error: { code: "not_found", message: "Фасон не найден" } }, { status: 404 });
    }

    // Валидация: все варианты принадлежат этому фасону
    const variantIdsInModel = new Set(model.variants.map((v) => v.id));
    for (const line of data.lines) {
      if (!variantIdsInModel.has(line.productVariantId)) {
        return NextResponse.json(
          { error: { code: "bad_request", message: "Позиция относится к другому фасону" } },
          { status: 400 },
        );
      }
    }

    // Расчёт экономики по каждой позиции.
    // Если передан unitCost — используем его как стоимость единицы (переопределяет fullCost с фасона).
    const effectiveUnitCost = data.unitCost != null
      ? new Prisma.Decimal(data.unitCost)
      : model.fullCost;
    const linesData = data.lines.map((line) => {
      const eco = calculateOrderEconomics(
        { ...model, fullCost: effectiveUnitCost },
        line.quantity,
      );
      return {
        productVariantId: line.productVariantId,
        quantity: line.quantity,
        sizeDistribution: line.sizeDistribution ?? undefined,
        snapshotFullCost: effectiveUnitCost,
        snapshotWbPrice: model.wbPrice,
        snapshotCustomerPrice: model.customerPrice,
        snapshotWbCommissionPct: model.wbCommissionPct,
        snapshotDrrPct: model.drrPct,
        snapshotRedemptionPct: model.plannedRedemptionPct,
        batchCost: eco.batchCost,
        plannedRevenue: eco.plannedRevenue,
      };
    });

    // Сумма партии = сумма по позициям
    const totalBatchCost = linesData.reduce(
      (a, l) => a + (l.batchCost ?? 0),
      0,
    );

    const toDate = (s?: string | null) => (s ? new Date(s) : null);

    // Фазы Разработка → Производство → ОТК → Доставка.
    // ВАЖНО: даты, которые Алёна расставила ползунками в форме, сохраняем
    // ТОЧЬ-В-ТОЧЬ (включая старт «Разработки» = decisionDate). Дефолтные
    // длительности (14/35/5/30 дн) подставляются ТОЛЬКО для пустых полей —
    // никакого «подтягивания» к минимуму, иначе плотный план раздувается и
    // в Ганте видны не те сроки, что задал пользователь.
    const phases = fillMissingOrderDates({
      decisionDate: toDate(data.decisionDate),
      handedToFactoryDate: toDate(data.handedToFactoryDate),
      readyAtFactoryDate: toDate(data.readyAtFactoryDate),
      qcDate: toDate(data.qcDate),
      arrivalPlannedDate: toDate(data.arrivalPlannedDate),
      createdAt: new Date(),
    });

    // Всё создание заказа — атомарно: заказ + лог статуса + упаковка + платежи.
    // При обрыве (Neon serverless) не остаётся «полузаказа» без графика оплат.
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: await nextOrderNumber(tx),
          productModelId: data.productModelId,
          orderType: data.orderType,
          season: data.season ?? null,
          launchMonth: data.launchMonth,
          factoryId: data.factoryId || model.preferredFactoryId || null,
          ownerId: data.ownerId,
          deliveryMethod: data.deliveryMethod ?? null,
          paymentTerms: data.paymentTerms ?? null,
          packagingType: data.packagingType ?? null,
          notes: data.notes ?? null,
          decisionDate: phases.decisionDate,
          handedToFactoryDate: phases.handedToFactoryDate,
          sewingStartDate: toDate(data.sewingStartDate),
          readyAtFactoryDate: phases.readyAtFactoryDate,
          qcDate: phases.qcDate,
          shipmentDate: toDate(data.shipmentDate),
          arrivalPlannedDate: phases.arrivalPlannedDate,
          packingDoneDate: toDate(data.packingDoneDate),
          wbShipmentDate: toDate(data.wbShipmentDate),
          saleStartDate: toDate(data.saleStartDate),
          lines: { create: linesData },
        },
      });

      await tx.orderStatusLog.create({
        data: { orderId: created.id, toStatus: created.status, changedById: session.user.id, comment: "Создание" },
      });

      // Копируем комплект упаковки с фасона
      if (model.packagingItems && model.packagingItems.length > 0) {
        await tx.orderPackaging.createMany({
          data: model.packagingItems.map((mp) => ({
            orderId: created.id,
            packagingItemId: mp.packagingItemId,
            quantityPerUnit: mp.quantityPerUnit,
          })),
          skipDuplicates: true,
        });
      }

      // Платежи: если передан график из формы — используем его; иначе автогенерация по paymentTerms.
      if (data.payments && data.payments.length > 0) {
        await tx.payment.createMany({
          data: data.payments.map((p) => ({
            type: "ORDER" as const,
            plannedDate: new Date(p.plannedDate),
            amount: p.amount,
            label: p.label,
            orderId: created.id,
            factoryId: created.factoryId,
            createdById: session.user.id,
            status: p.paid ? "PAID" as const : "PENDING" as const,
            paidAt: p.paid ? new Date() : null,
            paidById: p.paid ? session.user.id : null,
          })),
        });
      } else {
        const generated = generatePaymentsForOrder({
          id: created.id,
          paymentTerms: created.paymentTerms,
          batchCost: totalBatchCost > 0 ? new Prisma.Decimal(totalBatchCost) : null,
          factoryId: created.factoryId,
          createdAt: created.createdAt,
          readyAtFactoryDate: created.readyAtFactoryDate,
          launchMonth: created.launchMonth,
        });
        if (generated.length > 0) {
          await tx.payment.createMany({
            data: generated.map((p) => ({
              type: p.type,
              plannedDate: p.plannedDate,
              amount: p.amount,
              label: p.label,
              notes: p.notes,
              orderId: p.orderId,
              factoryId: p.factoryId,
              createdById: session.user.id,
            })),
          });
        }
      }

      return created;
    });

    // Аудит — после успешного коммита (его сбой не должен откатывать заказ).
    await logAudit({
      action: "CREATE",
      entityType: "Order",
      entityId: order.id,
      userId: session.user.id,
      changes: { orderNumber: order.orderNumber, productModelId: order.productModelId },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
