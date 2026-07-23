import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Служебный read-only вход для кабинета контента «Студия» (white-one-ctr).
// Отдаёт все НЕархивные цветомодели с производственными фактами: артикулы,
// цвета, состав, размеры, даты заказов, статус образца. Защита: Authorization:
// Bearer ${EXTERNAL_API_TOKEN} (по образцу CRON_SECRET в /api/cron/daily-digest).
// Писать через этот вход нельзя — только чтение.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.EXTERNAL_API_TOKEN;
  if (!secret) {
    return NextResponse.json({ error: "EXTERNAL_API_TOKEN не настроен" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const models = await prisma.productModel.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      brand: true,
      category: true,
      subcategory: true,
      artikulBase: true,
      fabricComposition: true,
      tnvedCode: true,
      photoUrls: true,
      plannedLaunchMonth: true,
      status: true,
      sizeGrid: { select: { sizes: true } },
      measurements: { select: { size: true, param: true, valueCm: true } },
      variants: {
        where: { deletedAt: null, status: { not: "DISCONTINUED" } },
        select: { sku: true, colorName: true, photoUrls: true },
      },
      samples: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, receivedDate: true, pulledForContentAt: true },
      },
      orders: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          readyAtFactoryDate: true,
          shipmentDate: true,
          arrivalPlannedDate: true,
          arrivalActualDate: true,
          wbShipmentDate: true,
          saleStartDate: true,
          wbCardReady: true,
        },
      },
    },
  });

  const articles = models.flatMap((m) => {
    const order = m.orders[0] ?? null;
    const sample = m.samples[0] ?? null;
    // замеры в формате Студии: {bySize: {размер: {параметр: см}}}
    const bySize: Record<string, Record<string, number | null>> = {};
    (m.measurements ?? []).forEach((mm) => {
      (bySize[mm.size] = bySize[mm.size] ?? {})[mm.param] = mm.valueCm;
    });
    const measurements = (m.measurements ?? []).length ? { bySize } : null;
    return m.variants.map((v) => ({
      sku: v.sku,
      modelId: m.id,
      measurements,
      artikulBase: m.artikulBase,
      modelName: m.name,
      brand: m.brand,
      category: m.category,
      subcategory: m.subcategory,
      colorName: v.colorName,
      fabricComposition: m.fabricComposition,
      tnvedCode: m.tnvedCode,
      photoUrls: [...v.photoUrls, ...m.photoUrls].slice(0, 12),
      sizes: m.sizeGrid?.sizes ?? [],
      plannedLaunchMonth: m.plannedLaunchMonth,
      status: m.status,
      readyAtFactoryDate: order?.readyAtFactoryDate ?? null,
      shipmentDate: order?.shipmentDate ?? null,
      arrivalPlannedDate: order?.arrivalPlannedDate ?? null,
      arrivalActualDate: order?.arrivalActualDate ?? null,
      wbShipmentDate: order?.wbShipmentDate ?? null,
      saleStartDate: order?.saleStartDate ?? null,
      wbCardReady: order?.wbCardReady ?? false,
      sample: sample
        ? {
            status: sample.status,
            receivedAt: sample.receivedDate,
            pulledForContentAt: sample.pulledForContentAt,
          }
        : null,
    }));
  });

  return NextResponse.json({ generatedAt: new Date().toISOString(), articles });
}
