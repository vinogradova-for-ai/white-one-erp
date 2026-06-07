// ======================================================
// ГЕНЕРАТОР АРТИКУЛОВ ТОВАРОВ (vendorCode / «артикул продавца» на WB)
// ======================================================
//
// Артикул печатается на наклейке Честного знака ПРЯМО НА ПРОИЗВОДСТВЕ.
// Поэтому алфавит выбирает СТРАНА производства (countryOfOrigin):
//
//   • Россия           → кириллица, номерная схема:  П_040_шоколад
//                        (упаковщик русскоязычный — читает по-русски)
//   • Китай/Кыргызстан → латиница, словами:          dress_kimono_chocolate
//                        (китайский упаковщик должен прочитать код на наклейке)
//
// Структура — 3 понятные части, цвет ПОЛНЫМ словом (не сокращением!),
// «чтобы понял самый незамороченный упаковщик»:
//     {тип}_{фасон-или-особенность}_{цвет}
//
// База артикула (тип+фасон / буква+номер) хранится на ФАСОНЕ (ProductModel.artikulBase)
// и одинакова у всех цветов. У цвета (ProductVariant.sku) дописывается только _{цвет}.

// ---------- Страна → алфавит ----------

/** true = латиница (Китай, Кыргызстан, всё кроме России). */
export function isLatinCountry(country: string | null | undefined): boolean {
  return normalize(country ?? "") !== "россия";
}

// ---------- Тип товара (категория) → слово/буква ----------

/** Категория → латинское слово типа (для Китая/Кыргызстана). Все слова — настоящий торговый английский. */
export const TYPE_LAT: Record<string, string> = {
  "Платья": "dress",
  "Летние платья": "dress",
  "Сарафаны": "sundress",
  "Брюки": "trousers", // НЕ "pants" — в брит./межд. английском pants = трусы (нижнее бельё)
  "Джинсы": "jeans",
  "Костюмы": "suit",
  "Летние костюмы": "suit",
  "Трикотажные костюмы": "knitset", // вязаный комплект (джемпер + вязаные штаны), НЕ костюмная пара "suit"
  "Блузки": "blouse",
  "Шорты": "shorts",
  "Юбки": "skirt",
  "Пальто": "coat",
  "Полупальто": "shortcoat", // не "halfcoat" (Runglish)
};

/** Категория → кириллическая буква (для России, номерная схема). */
export const PREFIX_CYR: Record<string, string> = {
  "Пальто": "П",
  "Полупальто": "ПП",
  "Платья": "ПЛ",
  "Летние платья": "ПЛ",
  "Сарафаны": "С",
  "Брюки": "Б",
  "Джинсы": "ДЖ",
  "Костюмы": "К",
  "Летние костюмы": "К",
  "Трикотажные костюмы": "ТК",
  "Блузки": "БЛ",
  "Шорты": "Ш",
  "Юбки": "Ю",
};

// ---------- Словарь цветов: русское название → ПОНЯТНОЕ латинское слово ----------
// Принцип: «чтобы дядька, который не отличает зелёный от оливкового, не запутался».
// Каждый цвет привязан к БАЗОВОМУ цвету (white/black/gray/blue/green/red/pink/brown/beige),
// а оттенок различаем простым light/dark/army — НЕ модным словом (olive/navy/burgundy).
// Похожие цвета специально разведены: green↔armygreen, lightblue↔darkblue, red↔darkred↔raspberry.
// Ключи нормализованы (нижний регистр, ё→е). Дополнять по мере появления цветов.

export const COLOR_LAT: Record<string, string> = {
  // Белые / нейтральные
  "белый": "white",
  "молочный": "ivory", // тёплый off-white; настоящее торговое слово
  "молоко": "ivory",
  "кремовый": "cream",
  "слоновая кость": "ivory",
  "черный": "black",
  "серый": "grey",
  "темно-серый": "darkgrey",
  "светло-серый": "lightgrey",
  "графит": "charcoal", // не "darkgray" — charcoal это и есть графит на тех-паках
  "антрацит": "anthracite",
  // Коричневые / тёплые нейтральные
  "шоколад": "chocolate",
  "шоколадный": "chocolate",
  "кофе": "coffee",
  "коричневый": "brown",
  "беж": "beige",
  "бежевый": "beige",
  "песочный": "sand",
  "карамель": "caramel",
  "кемел": "camel",
  "кэмел": "camel",
  "хаки": "khaki",
  // Красные / розовые
  "красный": "red",
  "бордо": "burgundy", // настоящее торговое слово
  "бордовый": "burgundy",
  "винный": "wine",
  "марсала": "marsala",
  "терракот": "terracotta",
  "кирпичный": "terracotta", // настоящее слово, не "brick"
  "ягодный": "berry",
  "коралл": "coral",
  "коралловый": "coral",
  "оранжевый": "orange",
  "розовый": "pink",
  "пудра": "powder",
  "пудровый": "powder",
  "пыльная роза": "dustyrose",
  // Жёлтые
  "желтый": "yellow",
  "горчица": "mustard",
  "горчичный": "mustard",
  "золото": "gold",
  "золотой": "gold",
  // Зелёные
  "зеленый": "green",
  "оливковый": "olive", // настоящее торговое слово
  "олива": "olive",
  "изумруд": "emerald",
  "мята": "mint",
  "мятный": "mint",
  // Синие / холодные
  "синий": "navy", // настоящее торговое слово
  "темно-синий": "navy",
  "голубой": "sky",
  "небо": "sky",
  "бирюза": "turquoise",
  "бирюзовый": "turquoise",
  "джинс": "denim",
  "деним": "denim",
  "индиго": "indigo",
  // Фиолетовые
  "фиолетовый": "purple",
  "сирень": "lilac",
  "сиреневый": "lilac",
  "лаванда": "lavender",
  "лавандовый": "lavender",
  "лиловый": "mauve",
  // Прочее
  "мрамор": "marble",
  "мраморный": "marble",
};

// ---------- Транслитерация (запасной вариант, если цвета нет в словаре) ----------

const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

/** Нормализация строки для ключей словаря/сравнений: trim, нижний регистр, ё→е. */
export function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/ё/g, "е");
}

/** Кириллица/латиница → чистый латинский токен (буквы/цифры, без разделителей). */
export function translit(raw: string): string {
  const lower = normalize(raw);
  let out = "";
  for (const ch of lower) {
    if (CYR_TO_LAT[ch] !== undefined) out += CYR_TO_LAT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    // всё прочее (пробелы, дефисы, знаки) опускаем — токен слитный
  }
  return out;
}

// ---------- Сборка частей ----------

/** Код цвета: латиница из словаря (или транслит), либо полное русское слово для России. */
export function colorCode(colorName: string, latin: boolean): string {
  const norm = normalize(colorName);
  if (!latin) return norm.replace(/\s+/g, "-"); // Россия: полное русское слово как есть
  return COLOR_LAT[norm] ?? translit(colorName);
}

/**
 * Подсказка «метки фасона» (вторая часть латинского артикула) из названия.
 * Берём название без ведущего слова-категории, первое значимое слово, транслит.
 * Напр. «Платье Кимоно» → "kimono", «Пальто Классика Миди» → "klassika".
 * Это лишь дефолт — человек правит на понятное англ. слово (kimono/halter/atlas/straight).
 */
export function styleSuggest(modelName: string, category: string): string {
  const catWord = normalize(category).replace(/ы$|и$|а$/, ""); // грубое «пальто/платья» → корень
  const words = normalize(modelName)
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .filter((w) => !w.startsWith(catWord.slice(0, 4)) || catWord.length < 3);
  const pick = words[0] ?? normalize(modelName);
  return translit(pick);
}

/** Латинская база: {тип}_{метка}.  Напр. dress_kimono. */
export function buildLatinBase(category: string, styleWord: string): string {
  const type = TYPE_LAT[category] ?? translit(category);
  const style = translit(styleWord);
  return style ? `${type}_${style}` : type;
}

/** Русская база: {буква}_{номер(3 знака)}.  Напр. П_040. */
export function buildRussiaBase(category: string, num: number): string {
  const prefix = PREFIX_CYR[category] ?? "X";
  return `${prefix}_${String(num).padStart(3, "0")}`;
}

/** Финальный артикул цвета: {база}_{цвет}. */
export function buildSku(base: string, colorName: string, latin: boolean): string {
  return `${base}_${colorCode(colorName, latin)}`;
}

/**
 * Полная сборка базы артикула фасона по стране.
 * Для России нужен следующий свободный номер категории (см. nextRussiaNumber в API).
 */
export function buildModelBase(opts: {
  category: string;
  country: string | null | undefined;
  styleWord: string; // метка для латиницы (для России игнорируется)
  russiaNumber?: number; // следующий номер для России
}): string {
  if (isLatinCountry(opts.country)) {
    return buildLatinBase(opts.category, opts.styleWord);
  }
  return buildRussiaBase(opts.category, opts.russiaNumber ?? 1);
}

/**
 * Извлечь номер из русской базы артикула («П_040» → 40), иначе null.
 * Используется для подсчёта следующего свободного номера категории.
 */
export function parseRussiaNumber(category: string, base: string): number | null {
  const prefix = PREFIX_CYR[category];
  if (!prefix) return null;
  const m = base.match(new RegExp(`^${prefix}_(\\d+)(?:_|$)`));
  return m ? Number(m[1]) : null;
}
