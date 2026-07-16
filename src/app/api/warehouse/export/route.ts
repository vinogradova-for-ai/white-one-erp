import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import {
  ORDER_STATUS_LABELS,
  DELIVERY_METHOD_LABELS,
  ORDER_TYPE_LABELS,
} from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PENDING_STATUSES = [
  "PREPARATION",
  "FABRIC_ORDERED",
  "SEWING",
  "QC",
  "IN_TRANSIT",
  "WAREHOUSE_MSK",
  "PACKING",
] as const;

function toAbsolute(req: NextRequest, url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${proto}://${host}${path}`;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  // YYYY-MM-DD — однозначно читается Excel'ем и любым внешним парсером
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const orders = await prisma.order.findMany({
      where: { deletedAt: null, status: { in: [...PENDING_STATUSES] } },
      include: {
        productModel: { select: { name: true, category: true, photoUrls: true } },
        factory: { select: { name: true, country: true } },
        lines: {
          select: {
            quantity: true,
            quantityActual: true,
            productVariant: {
              select: { sku: true, colorName: true, photoUrls: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ arrivalPlannedDate: "asc" }, { orderNumber: "asc" }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "White One ERP";
    wb.created = new Date();
    const ws = wb.addWorksheet("Склад");

    ws.columns = [
      { header: "№ заказа", key: "orderNumber", width: 16 },
      { header: "Артикул (SKU)", key: "sku", width: 32 },
      { header: "Фасон", key: "modelName", width: 36 },
      { header: "Категория", key: "category", width: 14 },
      { header: "Цвета", key: "colors", width: 24 },
      { header: "Тип заказа", key: "orderType", width: 12 },
      { header: "Количество", key: "quantity", width: 12 },
      { header: "Учёт кол-ва", key: "quantityKind", width: 12 },
      { header: "Статус", key: "status", width: 20 },
      { header: "Прибытие план", key: "arrivalPlanned", width: 14 },
      { header: "Прибытие факт", key: "arrivalActual", width: 14 },
      { header: "Отгрузка с фабрики", key: "shipmentDate", width: 16 },
      { header: "Фабрика", key: "factory", width: 24 },
      { header: "Страна", key: "country", width: 12 },
      { header: "Способ доставки", key: "delivery", width: 22 },
      { header: "Месяц запуска", key: "launchMonth", width: 14 },
      { header: "Фото (ссылка)", key: "photoUrl", width: 60 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: "middle" };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const o of orders) {
      const hasFact = o.lines.some((l) => l.quantityActual !== null);
      const totalQty = o.lines.reduce(
        (sum, l) => sum + (l.quantityActual ?? l.quantity),
        0,
      );
      const skus = o.lines.map((l) => l.productVariant.sku).join(", ");
      const colors = Array.from(
        new Set(o.lines.map((l) => l.productVariant.colorName)),
      ).join(", ");
      const photoSrc =
        o.lines[0]?.productVariant.photoUrls[0] ??
        o.productModel.photoUrls[0] ??
        null;
      const photoUrl = toAbsolute(req, photoSrc);

      const launchMonth =
        o.launchMonth > 0
          ? `${String(o.launchMonth).slice(0, 4)}-${String(o.launchMonth).slice(4, 6)}`
          : "";

      const row = ws.addRow({
        orderNumber: o.orderNumber,
        sku: skus,
        modelName: o.productModel.name,
        category: o.productModel.category,
        colors,
        orderType: ORDER_TYPE_LABELS[o.orderType] ?? o.orderType,
        quantity: totalQty,
        quantityKind: hasFact ? "факт" : "план",
        status: ORDER_STATUS_LABELS[o.status] ?? o.status,
        arrivalPlanned: formatDate(o.arrivalPlannedDate),
        arrivalActual: formatDate(o.arrivalActualDate),
        shipmentDate: formatDate(o.shipmentDate),
        factory: o.factory?.name ?? "",
        country: o.factory?.country ?? "",
        delivery: o.deliveryMethod
          ? (DELIVERY_METHOD_LABELS[o.deliveryMethod] ?? o.deliveryMethod)
          : "",
        launchMonth,
        photoUrl,
      });

      if (photoUrl) {
        row.getCell("photoUrl").value = {
          text: photoUrl,
          hyperlink: photoUrl,
        };
        row.getCell("photoUrl").font = { color: { argb: "FF1D4ED8" }, underline: true };
      }
    }

    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: ws.columnCount },
    };

    const buf = await wb.xlsx.writeBuffer();
    const fileName = `warehouse-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buf as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
