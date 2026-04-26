/**
 * Минимальный prod-seed.
 * Создаёт только Алёну как OWNER (одна учётка) и базовые справочники:
 * — 3 размерных сетки (одежда, размеры буквами, обувь)
 *
 * Никаких демо-фасонов/заказов/образцов/упаковки.
 * Реальные данные Алёна заведёт сама после деплоя.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash(
    process.env.SEED_OWNER_PASSWORD ?? "whiteone2026",
    10,
  );

  const owner = await prisma.user.upsert({
    where: { email: "alena@whiteone.ru" },
    update: {},
    create: {
      email: "alena@whiteone.ru",
      name: "Алёна",
      role: "OWNER",
      passwordHash,
      isActive: true,
    },
  });
  console.log(`✓ OWNER: ${owner.email}`);

  // Размерные сетки (примеры — можно править / добавлять)
  await prisma.sizeGrid.upsert({
    where: { name: "Одежда 42-52" },
    update: {},
    create: { name: "Одежда 42-52", sizes: ["42", "44", "46", "48", "50", "52"] },
  });
  await prisma.sizeGrid.upsert({
    where: { name: "Одежда XS-XXL" },
    update: {},
    create: { name: "Одежда XS-XXL", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  });
  await prisma.sizeGrid.upsert({
    where: { name: "Обувь 35-41" },
    update: {},
    create: { name: "Обувь 35-41", sizes: ["35", "36", "37", "38", "39", "40", "41"] },
  });
  console.log("✓ Размерные сетки: 3");

  console.log("\n✅ Готово. Войти: alena@whiteone.ru / whiteone2026");
  console.log("   ⚠ Смени пароль через переменную SEED_OWNER_PASSWORD при первом seed на проде.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
