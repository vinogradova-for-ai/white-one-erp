/**
 * Сжимает локальные фото и заливает их в Vercel Blob,
 * прописывает URL в productVariant.photoUrls по совпадению имени файла с sku.
 *
 * Запуск:
 *   npx tsx scripts/upload-local-photos.ts --dir "/path/to/photos"            # боевой
 *   npx tsx scripts/upload-local-photos.ts --dir "/path/to/photos" --dry-run  # только показать матч
 *
 * Имя файла = sku (например `КД_01_шоколад.png`).
 * Дополнительные ракурсы — суффикс через `_`: `КД_01_шоколад_2.png`.
 */
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");
const dirIdx = process.argv.indexOf("--dir");
if (dirIdx === -1 || !process.argv[dirIdx + 1]) {
  console.error("Нужен флаг --dir <path>");
  process.exit(1);
}
const DIR = process.argv[dirIdx + 1];

// Финальный размер: 800px по длинной стороне, webp q80 — обычно 50-150 КБ
const MAX_DIM = 800;
const QUALITY = 80;

type Photo = { sku: string; suffix: number; file: string };

function parseFile(file: string): Photo | null {
  const ext = path.extname(file).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) return null;
  // macOS отдаёт имена файлов в NFD (decomposed unicode), в БД — NFC. Приводим к одной форме.
  // macOS отдаёт NFD; в БД — NFC. Также убираем trailing/leading whitespace.
  const base = path.basename(file, ext).normalize("NFC").trim();
  const m = base.match(/^(.+?)(?:_(\d+))?$/);
  if (!m) return null;
  const tail = m[2] ? Number(m[2]) : 0;
  if (tail >= 2 && tail < 100) return { sku: m[1], suffix: tail, file };
  return { sku: base, suffix: 0, file };
}

async function compress(filePath: string): Promise<{ buf: Buffer; ext: "webp" }> {
  const buf = await sharp(filePath)
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
  return { buf, ext: "webp" };
}

async function main() {
  console.log(`Режим: ${DRY_RUN ? "DRY-RUN" : "LIVE"}`);
  console.log(`Папка: ${DIR}\n`);

  if (!fs.existsSync(DIR)) {
    console.error(`Папка не найдена: ${DIR}`);
    process.exit(1);
  }

  // Рекурсивный обход
  const files: string[] = [];
  function walk(d: string) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      if (name.startsWith(".")) continue;
      const stat = fs.statSync(p);
      if (stat.isDirectory()) walk(p);
      else files.push(p);
    }
  }
  walk(DIR);

  const photos = files.map(parseFile).filter((p): p is Photo => p !== null);
  console.log(`Файлов в папке: ${files.length}, годных фото: ${photos.length}`);

  // Группируем по sku
  const bySku = new Map<string, Photo[]>();
  for (const p of photos) {
    const arr = bySku.get(p.sku) ?? [];
    arr.push(p);
    bySku.set(p.sku, arr);
  }
  // Сортируем внутри каждого sku по suffix
  for (const arr of bySku.values()) arr.sort((a, b) => a.suffix - b.suffix);

  console.log(`Уникальных sku: ${bySku.size}\n`);

  // Берём цветомодели по этим sku из БД (case-insensitive)
  const skuList = [...bySku.keys()];
  const variants = await prisma.productVariant.findMany({
    where: { deletedAt: null, sku: { in: skuList } },
    select: { id: true, sku: true, photoUrls: true, productModel: { select: { name: true } } },
  });
  // Если case различается — добавим case-insensitive проход
  if (variants.length < skuList.length) {
    const found = new Set(variants.map((v) => v.sku.toLowerCase()));
    const missing = skuList.filter((s) => !found.has(s.toLowerCase()));
    if (missing.length) {
      const more = await prisma.productVariant.findMany({
        where: {
          deletedAt: null,
          OR: missing.map((s) => ({ sku: { equals: s, mode: "insensitive" as const } })),
        },
        select: { id: true, sku: true, photoUrls: true, productModel: { select: { name: true } } },
      });
      variants.push(...more);
    }
  }
  const bySkuLower = new Map(variants.map((v) => [v.sku.toLowerCase(), v]));

  // Для несматченных пробуем найти ProductModel по name (это «обложка фасона»).
  const unmatchedSkus = [...bySku.keys()].filter((s) => !bySkuLower.has(s.toLowerCase()));
  let modelByName = new Map<string, { id: string; name: string; photoUrls: string[] }>();
  if (unmatchedSkus.length) {
    const allModels = await prisma.productModel.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, photoUrls: true },
    });
    const byNameLower = new Map(allModels.map((m) => [m.name.normalize("NFC").trim().toLowerCase(), m]));
    for (const s of unmatchedSkus) {
      const m = byNameLower.get(s.toLowerCase());
      if (m) modelByName.set(s.toLowerCase(), m);
    }
  }

  let matched = 0, uploaded = 0, updated = 0;
  const notMatched: string[] = [];

  const CONCURRENCY = 4;
  const skuArr = [...bySku.keys()];
  let cursor = 0;

  async function processOne(sku: string) {
    const variant = bySkuLower.get(sku.toLowerCase());
    const model = !variant ? modelByName.get(sku.toLowerCase()) : null;
    const photoFiles = bySku.get(sku)!;
    if (!variant && !model) {
      notMatched.push(sku);
      console.log(`✗ ${sku}: ни цветомодель, ни фасон не найдены (файлов: ${photoFiles.length})`);
      return;
    }
    matched++;
    const urls: string[] = [];
    const target = variant ? `вариант ${variant.sku}` : `фасон ${model!.name}`;

    for (const p of photoFiles) {
      const { buf } = await compress(p.file);
      const sizeKB = Math.round(buf.length / 1024);
      const key = `local-photos/${sku}${p.suffix ? "_" + p.suffix : ""}.webp`;

      if (DRY_RUN) {
        console.log(`  ✓ ${path.basename(p.file)} → ${key} (${sizeKB} KB) → ${target}`);
        urls.push(`(blob://${key})`);
        continue;
      }
      try {
        const blob = await put(key, buf, {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "image/webp",
        });
        urls.push(blob.url);
        uploaded++;
        console.log(`  ✓ ${path.basename(p.file)} → ${blob.url.slice(-60)} (${sizeKB} KB) → ${target}`);
      } catch (e) {
        console.log(`  ✗ ${path.basename(p.file)}: ${(e as Error).message}`);
      }
    }

    if (urls.length === 0) return;

    if (DRY_RUN) {
      console.log(`  [dry] ${target} получит ${urls.length} фото`);
      return;
    }

    if (model) {
      await prisma.productModel.update({ where: { id: model.id }, data: { photoUrls: urls } });
      updated++;
      console.log(`  → фасон "${model.name}": записано ${urls.length} URL`);
      return;
    }

    await prisma.productVariant.update({
      where: { id: variant!.id },
      data: { photoUrls: urls },
    });
    updated++;
    console.log(`  → ${sku}: записано ${urls.length} URL`);
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= skuArr.length) break;
        await processOne(skuArr[i]);
      }
    })
  );

  console.log("\n────────── ИТОГИ ──────────");
  console.log(`Sku в папке:           ${bySku.size}`);
  console.log(`Сматчено с БД:         ${matched}`);
  console.log(`Не найдено в БД (${notMatched.length}): ${notMatched.join(", ")}`);
  if (!DRY_RUN) {
    console.log(`Залито в Blob:         ${uploaded} файл(ов)`);
    console.log(`Обновлено цветомоделей: ${updated}`);
  }

  // SKU в БД без фото, для которых нет файла в папке
  const allEmpty = await prisma.productVariant.findMany({
    where: {
      deletedAt: null,
      OR: [
        { photoUrls: { isEmpty: true } },
        { photoUrls: { hasSome: ["placeholder"] } },
      ],
    },
    select: { sku: true, photoUrls: true },
  });
  const photoSkus = new Set([...bySku.keys()].map((s) => s.toLowerCase()));
  const stillNoPhoto = allEmpty.filter((v) => !photoSkus.has(v.sku.toLowerCase()) && (v.photoUrls.length === 0 || v.photoUrls.every((u) => u.includes("unsplash.com") || u.includes("placeholder"))));
  if (stillNoPhoto.length) {
    console.log(`\nЦветомоделей в БД БЕЗ реального фото и БЕЗ файла в папке (${stillNoPhoto.length}):`);
    for (const v of stillNoPhoto.slice(0, 50)) console.log(`  ${v.sku}`);
    if (stillNoPhoto.length > 50) console.log(`  …(+${stillNoPhoto.length - 50})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
