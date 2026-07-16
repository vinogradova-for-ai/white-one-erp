import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { buildHonestSignRows } from "@/app/(app)/honest-sign/build-rows";
import { buildChzRow, CHZ_BY_CATEGORY, CHZ_RD_TYPE_IDS, type ChzRow } from "@/lib/chz";

/**
 * Генерация файлов «Честного знака» (Алёна 16.07):
 *  - IMPORT_K3_{категория}: заполняем КОПИЮ эталонного шаблона (справочники
 *    и формат нетронуты), строки с 5-й; статус «Черновик».
 *  - IMPORT_RD: декларации соответствия по GTIN (после их присвоения в ЧЗ).
 * Перед файлом всегда есть предпросмотр с дырами — «сюрпризов после
 * скачивания» быть не должно.
 */

const TEMPLATES_DIR = path.join(process.cwd(), "docs", "chz-templates");

export type K3Preview = {
  category: string;
  ok: Array<ChzRow & { modelId: string }>;
  problems: Array<{ modelId: string; modelName: string; sku: string; size: string; error: string }>;
};

export async function buildK3Preview(category: string, modelIds?: string[]): Promise<K3Preview | null> {
  if (!CHZ_BY_CATEGORY[category]) return null;
  const all = await buildHonestSignRows();
  const rows = all.filter(
    (r) => r.category === category && (!modelIds || modelIds.includes(r.modelId)),
  );

  const ok: K3Preview["ok"] = [];
  const problems: K3Preview["problems"] = [];
  for (const r of rows) {
    if (!r.size) {
      problems.push({ modelId: r.modelId, modelName: r.modelName, sku: r.sku, size: "", error: "нет размерной сетки" });
      continue;
    }
    const built = buildChzRow({
      category: r.category,
      sku: r.sku,
      colorName: r.colorName,
      size: r.size,
      tnvedCode: r.tnved,
      composition: r.composition,
    });
    if ("error" in built) {
      problems.push({ modelId: r.modelId, modelName: r.modelName, sku: r.sku, size: r.size, error: built.error });
    } else {
      ok.push({ ...built, modelId: r.modelId });
    }
  }
  return { category, ok, problems };
}

/** Заполненная книга шаблона категории. Кидает, если категория не замаплена. */
export async function buildK3Workbook(preview: K3Preview): Promise<ExcelJS.Workbook> {
  const t = CHZ_BY_CATEGORY[preview.category];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(TEMPLATES_DIR, t.file));
  const ws = wb.worksheets.find((w) => w.name.startsWith("IMPORT_CATEGORY_"));
  if (!ws) throw new Error("в эталоне нет листа IMPORT_CATEGORY_*");

  let rowIdx = 5;
  for (const r of preview.ok) {
    const row = ws.getRow(rowIdx++);
    row.getCell(2).value = r.tnvedShort;
    row.getCell(3).value = r.categoryCode;
    row.getCell(4).value = r.isKit;
    row.getCell(5).value = r.fullName;
    row.getCell(6).value = r.brand;
    row.getCell(7).value = "Артикул";
    row.getCell(8).value = r.artikul;
    row.getCell(10).value = r.productKind;
    row.getCell(11).value = r.chzColor;
    row.getCell(12).value = r.gender;
    row.getCell(13).value = r.sizeSystem;
    row.getCell(14).value = r.size;
    row.getCell(15).value = r.composition;
    row.getCell(16).value = r.tnvedFull;
    row.getCell(17).value = r.techReg;
    row.getCell(20).value = r.status;
    row.commit();
  }
  return wb;
}

// ── IMPORT_RD (декларации) ──

export type RdPreview = {
  doc: { id: string; kind: string; number: string; date: Date };
  gtins: string[];
  missing: Array<{ sku: string; size: string }>; // цветомодель×размер без GTIN
};

export async function buildRdPreview(docId: string): Promise<RdPreview | null> {
  const doc = await prisma.regulatoryDoc.findUnique({
    where: { id: docId },
    include: {
      models: {
        select: {
          sizeGrid: { select: { sizes: true } },
          variants: {
            where: { deletedAt: null },
            select: { sku: true, gtins: { select: { size: true, gtin: true } } },
          },
        },
      },
    },
  });
  if (!doc) return null;

  const gtins: string[] = [];
  const missing: RdPreview["missing"] = [];
  for (const m of doc.models) {
    const sizes = m.sizeGrid?.sizes ?? [];
    for (const v of m.variants) {
      const bySize = new Map(v.gtins.map((g) => [g.size, g.gtin]));
      for (const size of sizes) {
        const g = bySize.get(size);
        if (g) gtins.push(g);
        else missing.push({ sku: v.sku, size });
      }
    }
  }
  return { doc: { id: doc.id, kind: doc.kind, number: doc.number, date: doc.date }, gtins, missing };
}

export async function buildRdWorkbook(preview: RdPreview): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(TEMPLATES_DIR, "IMPORT_RD.xlsx"));
  const ws = wb.worksheets.find((w) => w.name === "IMPORT_RD");
  if (!ws) throw new Error("в эталоне нет листа IMPORT_RD");

  // В эталоне остались старые строки — вычищаем всё с 5-й.
  for (let i = ws.rowCount; i >= 5; i--) ws.spliceRows(i, 1);

  const typeId = CHZ_RD_TYPE_IDS[preview.doc.kind] ?? CHZ_RD_TYPE_IDS.DECLARATION;
  const dateStr = preview.doc.date.toISOString().slice(0, 10);
  let rowIdx = 5;
  for (const gtin of preview.gtins) {
    const row = ws.getRow(rowIdx++);
    row.getCell(1).value = gtin;
    row.getCell(5).value = "ДА";
    row.getCell(6).value = typeId;
    row.getCell(7).value = `${preview.doc.number}:::${dateStr}`;
    row.commit();
  }
  return wb;
}

// ── Приём GTIN обратно (выгрузка ЧЗ = тот же K3 с заполненным «Кодом товара») ──

export type GtinImportReport = {
  saved: number;
  unmatched: Array<{ gtin: string; artikul: string; size: string }>;
};

export async function importGtinsFromK3(buffer: Buffer): Promise<GtinImportReport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws =
    wb.worksheets.find((w) => w.name.startsWith("IMPORT_CATEGORY_")) ?? wb.worksheets[0];

  const variants = await prisma.productVariant.findMany({
    where: { deletedAt: null },
    select: { id: true, sku: true },
  });
  const bySku = new Map(variants.map((v) => [v.sku.trim().toLowerCase(), v.id]));

  let saved = 0;
  const unmatched: GtinImportReport["unmatched"] = [];

  for (let i = 5; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const gtin = String(row.getCell(1).value ?? "").trim();
    const artikul = String(row.getCell(8).value ?? "").trim();
    const size = String(row.getCell(14).value ?? "").trim();
    if (!gtin || !artikul || !size) continue;
    if (!/^\d{8,14}$/.test(gtin)) continue;

    const variantId = bySku.get(artikul.toLowerCase());
    if (!variantId) {
      unmatched.push({ gtin, artikul, size });
      continue;
    }
    await prisma.variantGtin.upsert({
      where: { variantId_size: { variantId, size } },
      create: { variantId, size, gtin },
      update: { gtin },
    });
    saved++;
  }
  return { saved, unmatched };
}
