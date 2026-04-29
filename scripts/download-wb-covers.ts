/**
 * Скачивает обложки WB по vendorCode и заливает в Vercel Blob.
 * Сопоставляет по sku → vendorCode (точное / fuzzy).
 *
 * Запуск:
 *   npx tsx scripts/download-wb-covers.ts            # боевой
 *   npx tsx scripts/download-wb-covers.ts --dry-run  # без записи в БД и Blob
 */
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import fs from "node:fs";

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes("--dry-run");

type Card = { nmID: number; vendorCode: string; brand: string | null; title: string | null };

// c516x688 ≈ 30-150 КБ, нам этого хватает для превью карточки
const SIZE = "c516x688";

async function probeBasket(nmID: number, b: number): Promise<{ url: string; ext: string } | null> {
  const vol = Math.floor(nmID / 100000);
  const part = Math.floor(nmID / 1000);
  const host = `basket-${String(b).padStart(2, "0")}.wbbasket.ru`;
  for (const ext of ["webp", "jpg"]) {
    const url = `https://${host}/vol${vol}/part${part}/${nmID}/images/${SIZE}/1.${ext}`;
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) });
      if (res.ok) return { url, ext };
    } catch {}
  }
  return null;
}

async function fetchCover(nmID: number): Promise<{ buf: Buffer; ext: string; basket: number } | null> {
  // Параллельно проверяем все 31 basket через HEAD-запросы — быстро
  const probes = await Promise.all(
    Array.from({ length: 31 }, (_, i) => probeBasket(nmID, i + 1).then((r) => (r ? { ...r, basket: i + 1 } : null)))
  );
  const found = probes.find((r) => r !== null);
  if (!found) return null;
  // Реально скачиваем тело только из найденного URL
  const res = await fetch(found.url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length <= 1000) return null;
  return { buf, ext: found.ext, basket: found.basket };
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, "").replace(/_+/g, "_").replace(/[​\n\r\t]/g, "");
}

function findCard(sku: string, cards: Card[], byVendor: Map<string, Card>): Card | null {
  const norm = normalize(sku);
  const exact = byVendor.get(norm);
  if (exact) return exact;

  for (const c of cards) {
    const n = normalize(c.vendorCode);
    if (n === norm) return c;
  }

  for (const c of cards) {
    const n = normalize(c.vendorCode);
    if (n.length > 5 && (n.startsWith(norm) || norm.startsWith(n))) return c;
  }

  // Подстрока в любую сторону, минимум 6 символов общих
  for (const c of cards) {
    const n = normalize(c.vendorCode);
    if (n.length >= 6 && norm.length >= 6 && (n.includes(norm) || norm.includes(n))) return c;
  }

  return null;
}

async function main() {
  console.log(`Режим: ${DRY_RUN ? "DRY-RUN (без записи)" : "LIVE"}`);
  const cards: Card[] = JSON.parse(fs.readFileSync("scripts/wb-cards.json", "utf-8"));
  console.log(`Карточек WB: ${cards.length}`);

  const byVendor = new Map<string, Card>();
  for (const c of cards) byVendor.set(normalize(c.vendorCode), c);

  const all = await prisma.productVariant.findMany({
    where: { deletedAt: null },
    include: { productModel: { select: { name: true } } },
  });
  const isPlaceholder = (urls: string[]) =>
    urls.length === 0 ||
    urls.every((u) => u.includes("unsplash.com") || u.includes("placeholder"));
  const variants = all.filter((v) => isPlaceholder(v.photoUrls));
  console.log(`Цветомоделей всего: ${all.length}, без реальных фото: ${variants.length}\n`);

  let matched = 0, downloaded = 0, uploaded = 0;
  const notMatched: string[] = [];
  const notFound: { sku: string; vendor: string; nmID: number }[] = [];

  const CONCURRENCY = 10;

  async function processOne(v: typeof variants[number]) {
    const card = findCard(v.sku, cards, byVendor);
    if (!card) {
      notMatched.push(v.sku);
      return;
    }
    matched++;

    const cover = await fetchCover(card.nmID);
    if (!cover) {
      notFound.push({ sku: v.sku, vendor: card.vendorCode, nmID: card.nmID });
      console.log(`✗ ${v.sku} ↔ ${card.vendorCode} (nmID ${card.nmID}): обложка не найдена`);
      return;
    }
    downloaded++;

    if (DRY_RUN) {
      console.log(`✓ ${v.sku} ← ${card.vendorCode} (basket-${String(cover.basket).padStart(2, "0")}, ${cover.buf.length} bytes, .${cover.ext})`);
      return;
    }

    try {
      const blob = await put(`wb-covers/${card.nmID}.${cover.ext}`, cover.buf, {
        access: "public",
        addRandomSuffix: false,
        contentType: cover.ext === "webp" ? "image/webp" : "image/jpeg",
      });
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { photoUrls: [blob.url] },
      });
      uploaded++;
      console.log(`✓ ${v.sku} ← ${card.vendorCode} → ${blob.url}`);
    } catch (e) {
      console.log(`✗ ${v.sku} ${(e as Error).message}`);
    }
  }

  // Простой пул concurrent worker'ов
  let cursor = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= variants.length) break;
        await processOne(variants[i]);
      }
    })
  );

  console.log("\n────────── ИТОГИ ──────────");
  console.log(`Сматчено vendorCode:  ${matched}/${variants.length}`);
  console.log(`Скачано обложек:      ${downloaded}`);
  if (!DRY_RUN) console.log(`Загружено в Blob:     ${uploaded}`);
  console.log(`НЕ сматчено (${notMatched.length}): ${notMatched.join(", ")}`);
  console.log(`Сматчено, но без обложки (${notFound.length}):`);
  for (const x of notFound) console.log(`  ${x.sku} ↔ ${x.vendor} (nmID ${x.nmID})`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
