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
execSync("npx prisma migrate deploy", { stdio: "inherit" });
