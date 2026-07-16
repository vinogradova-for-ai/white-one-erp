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
  // Пароль сида задаётся ТОЛЬКО через переменную окружения — общих дефолтов нет.
  const seedPassword = process.env.SEED_OWNER_PASSWORD;
  if (!seedPassword) {
    throw new Error("SEED_OWNER_PASSWORD не задан — сид без пароля не запускается");
  }
  const passwordHash = await bcrypt.hash(seedPassword, 10);

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

  // Команда продуктового отдела — нужна для фильтра «Ответственный» в Ганте,
  // селекторов owner в формах и т.п. Пароль у всех тот же.
  const team = [
    { email: "vera@whiteone.ru",  name: "Вера",  role: "PRODUCT_MANAGER" as const },
    { email: "olya.pm@whiteone.ru", name: "Оля",  role: "PRODUCT_MANAGER" as const },
    { email: "nastya@whiteone.ru",  name: "Настя", role: "ASSISTANT" as const },
    { email: "katya@whiteone.ru",   name: "Катя",  role: "CONTENT_MANAGER" as const },
  ];
  for (const u of team) {
    // update: только имя — повторный сид не должен возвращать доступ
    // отключённому сотруднику (isActive) и не должен сбрасывать роль
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { ...u, passwordHash, isActive: true },
    });
    console.log(`✓ ${u.role}: ${u.email}`);
  }

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

  console.log("\n✅ Готово. Логин владельца: alena@whiteone.ru, пароль — из SEED_OWNER_PASSWORD.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
