// Батч-генерация флэт-контуров для доски «Раскладка по цветам».
//
// Для каждого фасона с фото и без flatSketchSvg:
//   photoUrls[0] -> NB Pro (nb2_call.py) -> технический флэт PNG
//                -> potrace (flat_to_svg.py) -> перекрашиваемый SVG
//                -> ProductModel.flatSketchSvg
//
// Локальный ops-скрипт (НЕ часть деплоя). Пишет в БД из DATABASE_URL.
// Запуск (после деплоя миграции в прод):
//   DATABASE_URL="<prod-neon>" node scripts/flats/generate-flats.mjs --limit 5
//   ...                                                  --id <modelId>
//   ...                                                  --recolor   (пересобрать существующие)
//
// Требует: python3 + Pillow + potrace в PATH; ~/.claude/laozhang.env (ключ NB).
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const NB = join(HERE, "nb2_call.py");
const SVG = join(HERE, "flat_to_svg.py");
const MODEL_ID = "gemini-3-pro-image-preview";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const LIMIT = val("--limit") ? parseInt(val("--limit"), 10) : Infinity;
const ONLY_ID = val("--id");
const RECOLOR = flag("--recolor"); // пересобрать даже если flatSketchSvg уже есть

const prisma = new PrismaClient();

// Подсказка по конструкции изделия для промпта (по названию категории).
function garmentHint(category, name) {
  const s = `${category} ${name}`.toLowerCase();
  const has = (...ws) => ws.some((w) => s.includes(w));
  if (has("брюк", "палаццо", "джинс", "штан", "легинс")) return "the TROUSERS — both legs full length, waistband at top, leg drape and hem";
  if (has("шорт")) return "the SHORTS — waistband, both legs to mid-thigh, hem";
  if (has("юбк")) return "the SKIRT — waistband at top, full silhouette down to the hem";
  if (has("плать", "сараф", "ципао", "комбинез")) return "the DRESS — neckline/collar, bodice, waist, full skirt down to the hem";
  if (has("пальто", "плащ", "тренч", "шуба")) return "the COAT — collar/lapels, full-length body, sleeves, front closure/buttons, hem";
  if (has("жакет", "пиджак", "блейзер")) return "the BLAZER/JACKET — lapels, sleeves, front buttons, pockets, hem";
  if (has("бомбер", "куртк", "анорак", "ветровк")) return "the JACKET — collar/zip, sleeves with cuffs, hem band, pockets";
  if (has("кардиган", "джемпер", "свитер", "кофта", "худи")) return "the KNIT TOP — neckline, sleeves with cuffs, body, hem";
  if (has("рубаш", "блуз", "сорочк")) return "the SHIRT/BLOUSE — collar, button placket, sleeves with cuffs, hem";
  if (has("топ", "майк", "лонг", "футбол", "боди", "корсет", "бюстье")) return "the TOP — neckline/straps, body, hem (sleeveless or short sleeves as in photo)";
  return "the MAIN GARMENT shown (ignore any second garment, model and background)";
}

function buildPrompt(category, name) {
  const hint = garmentHint(category, name);
  return `Technical fashion FLAT SKETCH (apparel tech-pack line drawing) of ${hint}, taken from the reference photo.

CRITICAL: Draw ONLY that garment. Completely ignore and exclude the model, her body, skin, hands, accessories, any other clothing, and the background — extract just the garment.

Output style:
- Flat, 2D, FRONT-VIEW technical drawing, symmetric, laid out as if on an invisible hanger (NOT on a body, NOT in the photo's pose).
- Even, uniform, thin BLACK outline, clean smooth vector-like lines. Show construction details (seams, darts, collar, plackets, buttons, cuffs, pockets, gathers) as thin black lines.
- Fill the garment with ONE single flat solid colour (neutral light grey). No shading, no fabric texture, no shadows, no highlights, no gradient — pure flat fill.
- Pure WHITE background (#FFFFFF). Centered, even margins, no drop shadow.

Neat professional apparel technical flat in a brand line sheet.`;
}

async function main() {
  const where = { deletedAt: null, activated: true };
  if (ONLY_ID) where.id = ONLY_ID;
  if (!RECOLOR && !ONLY_ID) where.flatSketchSvg = null;

  const models = await prisma.productModel.findMany({
    where,
    select: { id: true, name: true, category: true, photoUrls: true, flatSketchSvg: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const todo = models.filter((m) => (m.photoUrls?.length ?? 0) > 0).slice(0, LIMIT);
  console.log(`Найдено ${models.length} фасонов, к генерации: ${todo.length}`);

  let ok = 0, fail = 0;
  for (const m of todo) {
    const dir = mkdtempSync(join(tmpdir(), "flat-"));
    try {
      const photoUrl = m.photoUrls[0];
      const res = await fetch(photoUrl);
      if (!res.ok) throw new Error(`фото ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = (photoUrl.split("?")[0].split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const photo = join(dir, `src.${ext}`);
      writeFileSync(photo, buf);

      const promptFile = join(dir, "prompt.txt");
      writeFileSync(promptFile, buildPrompt(m.category, m.name));
      const flatPng = join(dir, "flat.png");
      execFileSync("python3", [NB, MODEL_ID, promptFile, flatPng, photo], { stdio: ["ignore", "ignore", "inherit"], timeout: 220000 });

      const svgFile = join(dir, "flat.svg");
      execFileSync("python3", [SVG, flatPng, svgFile], { stdio: ["ignore", "ignore", "inherit"], timeout: 60000 });
      const svg = readFileSync(svgFile, "utf8");
      if (!svg.includes("<path")) throw new Error("пустой SVG");

      await prisma.productModel.update({ where: { id: m.id }, data: { flatSketchSvg: svg } });
      ok++;
      console.log(`  ✓ ${m.name} (${m.category}) — ${svg.length} B`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${m.name} (${m.category}) — ${e.message}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log(`Готово: ${ok} ок, ${fail} ошибок.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
