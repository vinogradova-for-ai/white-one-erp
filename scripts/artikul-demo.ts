/**
 * Демо генератора артикулов на реальных примерах White One.
 * Запуск:  npx tsx scripts/artikul-demo.ts
 * Ничего не пишет в БД — просто печатает, что сгенерирует генератор.
 */
import {
  buildLatinBase,
  buildRussiaBase,
  buildSku,
  isLatinCountry,
  styleSuggest,
} from "../src/lib/artikul";

function row(a: string, b: string) {
  return `   ${a.padEnd(34)} ${b}`;
}

console.log("\n================ 🇨🇳 КИТАЙ / КЫРГЫЗСТАН → латиница, словами ================\n");

const china: { name: string; category: string; style?: string; colors: string[] }[] = [
  { name: "Платье Кимоно", category: "Платья", style: "kimono", colors: ["шоколад", "молочный", "черный", "красный", "зеленый"] },
  { name: "Платье Алладин", category: "Платья", style: "alladin", colors: ["кирпичный", "черный", "ягодный", "молочный"] },
  { name: "Платье Солнце", category: "Платья", style: "sun", colors: ["белый", "голубой", "розовый", "черный"] },
  { name: "Костюм с брюками", category: "Костюмы", style: "trousers", colors: ["молочный", "хаки", "черный"] },
  { name: "Брюки атлас", category: "Брюки", style: "atlas", colors: ["шоколад", "оливковый"] },
  { name: "Брюки прямые", category: "Брюки", style: "straight", colors: ["серый", "белый", "молочный"] },
  { name: "Блузка-халтер", category: "Блузки", style: "halter", colors: ["молочный", "оливковый", "черный", "голубой"] },
  { name: "Джинсы прямые", category: "Джинсы", style: "straight", colors: ["синий", "черный", "белый", "джинс"] },
  { name: "Трикотажный комплект (джемпер+штаны)", category: "Трикотажные костюмы", style: "jumper", colors: ["молочный", "беж", "графит", "бордо"] },
];

let demoNum = 0;
for (const m of china) {
  const style = m.style ?? styleSuggest(m.name, m.category);
  const base = buildLatinBase(m.category, ++demoNum, style); // демо: сквозной номер (в проде свой счётчик у категории)
  const autoHint = m.style ? "" : `  (метка авто из названия: «${style}»)`;
  console.log(`▸ ${m.name}  [${m.category}]  →  база: ${base}${autoHint}`);
  for (const c of m.colors) {
    console.log(row(`   ${c}`, buildSku(base, c, true)));
  }
  console.log("");
}

console.log("================ 🇷🇺 РОССИЯ → кириллица, номерная ================\n");

const russia: { name: string; category: string; num: number; colors: string[] }[] = [
  { name: "Пальто Классика Миди", category: "Пальто", num: 40, colors: ["шоколад", "графит", "беж", "бордо"] },
  { name: "Пальто Двубортное", category: "Пальто", num: 41, colors: ["черный", "серый", "молочный"] },
  { name: "Полупальто Кокон", category: "Полупальто", num: 3, colors: ["белый", "графит"] },
];

for (const m of russia) {
  const base = buildRussiaBase(m.category, m.num);
  console.log(`▸ ${m.name}  [${m.category}]  страна=Россия (латиница? ${isLatinCountry("Россия")})  →  база: ${base}`);
  for (const c of m.colors) {
    console.log(row(`   ${c}`, buildSku(base, c, false)));
  }
  console.log("");
}

console.log("======= 🧠 РАЗВЕДЕНИЕ ПОХОЖИХ ЦВЕТОВ (чтобы дядька не перепутал) =======\n");
const pairs = [
  ["зелёный", "оливковый"],
  ["голубой", "синий"],
  ["красный", "бордо", "ягодный"],
  ["белый", "молочный"],
  ["серый", "графит"],
  ["шоколад", "коричневый", "беж"],
];
for (const group of pairs) {
  const codes = group.map((c) => `${c} → ${buildSku("X", c, true).replace("X_", "")}`);
  console.log("   " + codes.join("   ·   "));
}

console.log("\n================ проверка переключения по стране ================\n");
for (const country of ["Китай", "Кыргызстан", "Россия"]) {
  console.log(row(`страна = ${country}`, `латиница: ${isLatinCountry(country)}`));
}
console.log("");
