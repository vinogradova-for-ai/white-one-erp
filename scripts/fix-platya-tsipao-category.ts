/**
 * Одноразовый fix: у «Платье ципао» категория «Платье» (imported),
 * а в фиксированном списке формы — «Платья». Меняем на «Платья»,
 * чтобы при редактировании select подсвечивал текущее значение.
 *
 * Запуск: (set -a; source .env.local; set +a; npx tsx scripts/fix-platya-tsipao-category.ts)
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const res = await prisma.productModel.updateMany({
    where: { name: "Платье ципао", category: "Платье", deletedAt: null },
    data: { category: "Платья" },
  });
  console.log(`Обновлено фасонов: ${res.count}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
