/**
 * Одноразовый скрипт: добавить команду продуктового отдела в БД.
 * Идемпотентен — re-run не плодит дублей.
 *
 *   npx tsx scripts/add-team-members.ts
 *
 * Пароль берётся ТОЛЬКО из SEED_OWNER_PASSWORD env — без него скрипт не запустится.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TEAM = [
  { email: "vera@whiteone.ru",    name: "Вера",  role: "PRODUCT_MANAGER" as const },
  { email: "olya.pm@whiteone.ru", name: "Оля",   role: "PRODUCT_MANAGER" as const },
  { email: "nastya@whiteone.ru",  name: "Настя", role: "ASSISTANT" as const },
  { email: "katya@whiteone.ru",   name: "Катя",  role: "CONTENT_MANAGER" as const },
];

async function main() {
  const passwordHash = await bcrypt.hash(
    (() => { const p = process.env.SEED_OWNER_PASSWORD; if (!p) throw new Error("SEED_OWNER_PASSWORD не задан"); return p; })(),
    10,
  );
  for (const u of TEAM) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, isActive: true },
      create: { ...u, passwordHash, isActive: true },
    });
    console.log(`✓ ${u.role}: ${u.email}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
