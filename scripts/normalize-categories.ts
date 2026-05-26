/**
 * Нормализация категорий фасонов.
 *
 * Алёна на /orders увидела два фильтра: «Платье» (11) и «Платья» (2) —
 * это одна категория в разном написании. Приводим всё к канонической
 * форме из CATEGORIES (lib/constants).
 *
 * Запуск:
 *   cd ~/projects/white-one
 *   (set -a; source .env.local; set +a; npx tsx scripts/normalize-categories.ts --apply)
 *
 * Без --apply скрипт делает dry-run и просто печатает что бы он поменял.
 */
import { PrismaClient } from "@prisma/client";
import { CATEGORIES } from "../src/lib/constants";

const p = new PrismaClient();

// Только явные орфографические/числовые дубликаты — не сливаем разные
// типы одежды. «Полупальто» ≠ «Пальто», «Жилет» ≠ «Жакет» — это разные
// категории, их надо добавлять в CATEGORIES, а не сливать.
const ALIASES: Record<string, string> = {
  "Платье": "Платья",
  "Юбка": "Юбки",
  "Жакет": "Жакеты",
  "Брюка": "Брюки",
  "Костюм": "Костюмы",
  "Сарафан": "Сарафаны",
};

async function main() {
  const apply = process.argv.includes("--apply");

  const canon = new Set<string>(CATEGORIES);
  const models = await p.productModel.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, category: true },
  });

  const fixes: Array<{ id: string; name: string; from: string; to: string }> = [];
  const unknown: Map<string, number> = new Map();

  for (const m of models) {
    const cur = m.category;
    if (canon.has(cur)) continue;

    const target = ALIASES[cur];
    if (target && canon.has(target)) {
      fixes.push({ id: m.id, name: m.name, from: cur, to: target });
    } else {
      unknown.set(cur, (unknown.get(cur) ?? 0) + 1);
    }
  }

  console.log(`Всего фасонов: ${models.length}`);
  console.log(`К правке: ${fixes.length}`);
  if (fixes.length > 0) {
    const grouped = new Map<string, number>();
    for (const f of fixes) {
      grouped.set(`${f.from} → ${f.to}`, (grouped.get(`${f.from} → ${f.to}`) ?? 0) + 1);
    }
    for (const [k, v] of grouped) console.log(`  ${k}: ${v}`);
  }
  if (unknown.size > 0) {
    console.log(`\nНестандартные категории, для которых НЕТ алиаса (ничего не сделано):`);
    for (const [k, v] of unknown) console.log(`  «${k}»: ${v}`);
  }

  if (!apply) {
    console.log(`\nDRY-RUN. Запусти с --apply чтобы применить.`);
    await p.$disconnect();
    return;
  }

  let updated = 0;
  for (const f of fixes) {
    await p.productModel.update({ where: { id: f.id }, data: { category: f.to } });
    updated++;
  }
  console.log(`\nГотово: обновлено ${updated} фасонов.`);
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
