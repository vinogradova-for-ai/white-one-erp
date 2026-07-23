import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Студия сообщает: карточка ВБ по артикулу залита полностью → флаг на последнем
// заказе модели (Order.wbCardReady). Единственная разрешённая запись через
// внешний токен — один булев флаг, ничего больше (ТЗ Студии, этап 3).

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.EXTERNAL_API_TOKEN;
  if (!secret) return NextResponse.json({ error: "EXTERNAL_API_TOKEN не настроен" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const sku = body?.sku;
  if (!sku) return NextResponse.json({ error: "нужен sku" }, { status: 400 });

  const variant = await prisma.productVariant.findFirst({
    where: { sku, deletedAt: null },
    select: { productModelId: true },
  });
  if (!variant) return NextResponse.json({ error: "артикул не найден" }, { status: 404 });

  const order = await prisma.order.findFirst({
    where: { productModelId: variant.productModelId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, wbCardReady: true },
  });
  if (!order) return NextResponse.json({ ok: true, updated: false, reason: "нет заказа" });
  if (!order.wbCardReady) {
    await prisma.order.update({ where: { id: order.id }, data: { wbCardReady: true } });
  }
  return NextResponse.json({ ok: true, updated: !order.wbCardReady });
}
