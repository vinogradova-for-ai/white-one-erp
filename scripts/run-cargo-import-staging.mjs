// Запуск импорта карго НА ДУБЛЕ (neondb_staging).
// URL стейджа = прод-DATABASE_URL из ~/projects/white-one/.env.local
// с заменой БД /neondb → /neondb_staging (регламент дубля, хэндофф 02.07).
// Секрет читается из файла и не попадает в argv/вывод.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const envText = readFileSync(join(homedir(), "projects/white-one/.env.local"), "utf8");
const line = envText.split("\n").find((l) => l.trim().startsWith("DATABASE_URL"));
if (!line) throw new Error("DATABASE_URL не найден в прод-.env.local");
let url = line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
if (!url.includes("/neondb")) throw new Error("В URL нет /neondb — это не Neon-прод");
url = url.replace("/neondb", "/neondb_staging");
console.log("Цель: neondb_staging (протокол " + url.split("://")[0] + "://…)");

const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [join(here, "import-cargo.mjs")], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
process.exit(r.status ?? 1);
