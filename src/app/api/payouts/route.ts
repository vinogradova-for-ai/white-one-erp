import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { assertCan } from "@/lib/rbac";
import { logAudit } from "@/server/audit";
import { payoutCreateSchema } from "@/lib/validators/payout";
import { getOpenPaymentsForFactory } from "@/lib/payments/payout-queries";
import { toKopecks, kopecksToRubString } from "@/lib/payments/allocate-payout";

// GET /api/payouts?factoryId=... — открытые плановые платежи фабрики (для формы).
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "payment.read");
    const factoryId = req.nextUrl.searchParams.get("factoryId");
    if (!factoryId) return NextResponse.json({ payments: [] });
    const payments = await getOpenPaymentsForFactory(factoryId);
    return NextResponse.json({ payments });
  } catch (e) {
    return apiError(e);
  }
}

// POST /api/payouts — создать оплату фабрике + разнести по плановым платежам.
// Всё одной транзакцией. Право — payment.markPaid.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    assertCan(session.user.role, "payment.markPaid");
    const body = await req.json().catch(() => ({}));
    const data = payoutCreateSchema.parse(body);

    const totalKopecks = toKopecks(data.amount);

    // Оставляем только разнесения с суммой > 0 и схлопываем дубли по paymentId.
    const byPayment = new Map<string, number>();
    for (const a of data.allocations) {
      const kop = toKopecks(a.amount);
      if (kop <= 0) continue;
      byPayment.set(a.paymentId, (byPayment.get(a.paymentId) ?? 0) + kop);
    }
    const allocEntries = [...byPayment.entries()];

    // Валидация: сумма разнесений не больше суммы перевода.
    const allocatedTotal = allocEntries.reduce((s, [, k]) => s + k, 0);
    if (allocatedTotal > totalKopecks) {
      return NextResponse.json(
        { error: { code: "validation", message: "Разнесено больше суммы оплаты" } },
        { status: 400 },
      );
    }

    // Проверка: платежи существуют и относятся к этой фабрике; разнесение не
    // превышает остаток каждого платежа (страховка от гонок/ручной правки).
    if (allocEntries.length > 0) {
      const open = await getOpenPaymentsForFactory(data.factoryId);
      const openById = new Map(open.map((p) => [p.id, p]));
      for (const [paymentId, kop] of allocEntries) {
        const op = openById.get(paymentId);
        if (!op) {
          return NextResponse.json(
            { error: { code: "validation", message: "Платёж не найден или не относится к этой фабрике" } },
            { status: 400 },
          );
        }
        if (kop > op.remainingKopecks) {
          return NextResponse.json(
            { error: { code: "validation", message: `Разнесение на «${op.targetLabel}» больше остатка платежа` } },
            { status: 400 },
          );
        }
      }
    }

    const factory = await prisma.factory.findUnique({ where: { id: data.factoryId }, select: { name: true } });

    const payout = await prisma.$transaction(async (tx) => {
      const created = await tx.factoryPayout.create({
        data: {
          date: new Date(data.date),
          amount: kopecksToRubString(totalKopecks),
          currencyNote: data.currencyNote ?? null,
          comment: data.comment ?? null,
          factoryId: data.factoryId,
          createdById: session.user.id,
        },
      });
      if (allocEntries.length > 0) {
        await tx.payoutAllocation.createMany({
          data: allocEntries.map(([paymentId, kop]) => ({
            payoutId: created.id,
            paymentId,
            amount: kopecksToRubString(kop),
          })),
        });
      }
      return created;
    });

    await logAudit({
      action: "CREATE",
      entityType: "FactoryPayout",
      entityId: payout.id,
      userId: session.user.id,
      changes: {
        amount: kopecksToRubString(totalKopecks),
        factory: factory?.name ?? data.factoryId,
        allocations: allocEntries.length,
      },
    });

    return NextResponse.json({ id: payout.id }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
