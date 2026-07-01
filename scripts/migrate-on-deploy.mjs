// Применяет миграции БД только в НАСТОЯЩЕМ production-деплое Vercel
// (или локально, когда VERCEL_ENV не задан). Preview-сборки веток миграции
// НЕ применяют — чтобы черновая ветка не уехала миграцией в боевую базу
// (находка аудита 02.07.2026).
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
if (env === "preview") {
  console.log("⏭ preview-сборка: prisma migrate deploy пропущен (защита боевой базы)");
  process.exit(0);
}

// Авто-ретрай при холодном старте Neon (перенесено из vercel.json, PR #141)
const delays = [0, 8, 20];
for (let i = 0; i < delays.length; i++) {
  if (delays[i] > 0) {
    console.log(`↻ migrate: retry через ${delays[i]}с (база просыпается)`);
    execSync(`sleep ${delays[i]}`);
  }
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    process.exit(0);
  } catch (e) {
    if (i === delays.length - 1) throw e;
  }
}
