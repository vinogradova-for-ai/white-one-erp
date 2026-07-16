import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAuth, apiError } from "@/server/api-helpers";
import { buildHonestSignRows } from "@/app/(app)/honest-sign/build-rows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Выгрузка справочника «Честный знак» в Excel.
// Данные собираются той же функцией, что и таблица на странице —
// файл и экран идентичны. Витрина read-only, видна всем ролям.
export async function GET() {
  try {
    await requireAuth();

    const rows = await buildHonestSignRows();

    const wb = new ExcelJS.Workbook();
    wb.creator = "White One ERP";
    wb.created = new Date();
    const ws = wb.addWorksheet("Честный знак");

    ws.columns = [
      { header: "Наименование", key: "name", width: 48 },
      { header: "Артикул", key: "sku", width: 28 },
      { header: "Товарный знак", key: "brand", width: 14 },
      { header: "Вид одежды", key: "category", width: 14 },
      { header: "Целевой пол", key: "gender", width: 12 },
      { header: "Цвет", key: "colorName", width: 16 },
      { header: "Размер", key: "size", width: 10 },
      { header: "Состав", key: "composition", width: 28 },
      { header: "ТНВЭД", key: "tnved", width: 16 },
      { header: "Страна производства", key: "country", width: 18 },
    ];

    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: "middle" };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const r of rows) {
      const row = ws.addRow({
        name: r.name,
        sku: r.sku,
        brand: r.brand,
        category: r.category,
        gender: r.gender,
        colorName: r.colorName,
        size: r.size,
        composition: r.composition,
        tnved: r.tnved,
        country: r.country,
      });

      // Подсветка дыр (пустые цвет / состав / ТНВЭД) — как на странице.
      const holeCells: Array<{ cell: string; value: string }> = [
        { cell: "colorName", value: r.colorName },
        { cell: "composition", value: r.composition },
        { cell: "tnved", value: r.tnved },
      ];
      for (const h of holeCells) {
        if (h.value.trim() === "") {
          const c = row.getCell(h.cell);
          c.value = "— не заполнено";
          c.font = { color: { argb: "FFDC2626" }, italic: true };
          c.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFEE2E2" },
          };
        }
      }
    }

    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: ws.columnCount },
    };

    const buf = await wb.xlsx.writeBuffer();
    const fileName = `honest-sign-${new Date().toISOString().slice(0, 10)}.xlsx`;

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
