import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { ORDER_STATUS_LABELS, DELIVERY_METHOD_LABELS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK"] as const;

function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    await requireAuth();

    const orders = await prisma.order.findMany({
      where: { deletedAt: null, status: { in: [...STATUSES] } },
      include: {
        productModel: { include: { sizeGrid: true } },
        factory: { select: { name: true } },
        owner: { select: { name: true } },
        lines: {
          include: {
            productVariant: { select: { sku: true, colorName: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { arrivalPlannedDate: "asc" },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "White One ERP";
    wb.created = new Date();

    // ============ Лист 1: Общий план ============
    const sheetSummary = wb.addWorksheet("План отгрузок");
    sheetSummary.columns = [
      { header: "Заказ", key: "orderNumber", width: 18 },
      { header: "Изделие", key: "model", width: 36 },
      { header: "Фабрика", key: "factory", width: 26 },
      { header: "Статус", key: "status", width: 14 },
      { header: "Доставка", key: "delivery", width: 14 },
      { header: "Прибытие план", key: "arrivalPlanned", width: 14 },
      { header: "Прибытие факт", key: "arrivalActual", width: 14 },
      { header: "Штук всего", key: "totalQty", width: 12 },
      { header: "Ответственный", key: "owner", width: 16 },
    ];
    sheetSummary.getRow(1).font = { bold: true };
    sheetSummary.getRow(1).alignment = { vertical: "middle" };

    for (const o of orders) {
      const totalQty = o.lines.reduce(
        (a, l) => a + (l.quantityActual ?? l.quantity),
        0,
      );
      sheetSummary.addRow({
        orderNumber: o.orderNumber,
        model: o.productModel.name,
        factory: o.factory?.name ?? "",
        status: ORDER_STATUS_LABELS[o.status] ?? o.status,
        delivery: o.deliveryMethod ? DELIVERY_METHOD_LABELS[o.deliveryMethod] : "",
        arrivalPlanned: formatDate(o.arrivalPlannedDate),
        arrivalActual: formatDate(o.arrivalActualDate),
        totalQty,
        owner: o.owner?.name ?? "",
      });
    }

    // ============ Лист 2: По артикулам с размерами ============
    // Собираем универсальный список размеров из всех sizeGrid (фасоны могут
    // иметь разные сетки — XS-XXL и 40-60, например). Сортируем по частоте.
    const sizesUnion = new Map<string, number>();
    for (const o of orders) {
      const sizes = o.productModel.sizeGrid?.sizes ?? [];
      for (const s of sizes) sizesUnion.set(s, (sizesUnion.get(s) ?? 0) + 1);
      for (const l of o.lines) {
        const dist = (l.sizeDistributionActual ?? l.sizeDistribution) as Record<string, number> | null;
        if (dist) for (const k of Object.keys(dist)) {
          sizesUnion.set(k, (sizesUnion.get(k) ?? 0) + 1);
        }
      }
    }
    const sortedSizes = [...sizesUnion.keys()].sort((a, b) => {
      const an = parseInt(a, 10);
      const bn = parseInt(b, 10);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      // алфавит — для XS/S/M/L/XL/XXL
      const order = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "ONE SIZE"];
      const ai = order.indexOf(a.toUpperCase());
      const bi = order.indexOf(b.toUpperCase());
      if (ai >= 0 && bi >= 0) return ai - bi;
      return a.localeCompare(b);
    });

    const sheetBySize = wb.addWorksheet("По артикулам и размерам");
    sheetBySize.columns = [
      { header: "Заказ", key: "orderNumber", width: 18 },
      { header: "Изделие", key: "model", width: 32 },
      { header: "Артикул", key: "sku", width: 16 },
      { header: "Цвет", key: "color", width: 14 },
      { header: "Прибытие план", key: "arrivalPlanned", width: 14 },
      ...sortedSizes.map((s) => ({ header: s, key: `size_${s}`, width: 8 })),
      { header: "Всего", key: "total", width: 10 },
    ];
    sheetBySize.getRow(1).font = { bold: true };
    sheetBySize.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

    for (const o of orders) {
      for (const l of o.lines) {
        const dist = (l.sizeDistributionActual ?? l.sizeDistribution) as Record<string, number> | null;
        const total = l.quantityActual ?? l.quantity;
        const row: Record<string, string | number> = {
          orderNumber: o.orderNumber,
          model: o.productModel.name,
          sku: l.productVariant.sku ?? "",
          color: l.productVariant.colorName ?? "",
          arrivalPlanned: formatDate(o.arrivalPlannedDate),
          total,
        };
        for (const s of sortedSizes) {
          row[`size_${s}`] = dist?.[s] ?? 0;
        }
        sheetBySize.addRow(row);
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    const today = new Date().toISOString().slice(0, 10);
    const fileName = `incoming-plan-${today}.xlsx`;
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
