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

/** true = латиница (Китай, Кыргызстан, всё кроме России). Историческое — алфавит теперь решает категория. */
export function isLatinCountry(country: string | null | undefined): boolean {
  return normalize(country ?? "") !== "россия";
}

// ---------- Алфавит артикула решает КАТЕГОРИЯ ----------
// Кириллица (номерная П_/ПП_) — ТОЛЬКО пальто и полупальто: их так зовут в России.
// Все остальные категории — латиница, даже если шьются в России.

export const CYRILLIC_CATEGORIES = new Set(["Пальто", "Полупальто"]);

/** true = категория ведётся кириллицей-номером (только пальто/полупальто). */
export function usesCyrillicScheme(category: string | null | undefined): boolean {
  return CYRILLIC_CATEGORIES.has((category ?? "").trim());
}

/** Латиница ли артикул по категории (всё кроме пальто/полупальто). */
export function isLatinCategory(category: string | null | undefined): boolean {
  return !usesCyrillicScheme(category);
}

// ---------- Тип товара (категория) → слово/буква ----------

/** Категория → КОРОТКИЙ код типа (первое слово артикула). Сокращения как в старых
 *  артикулах Алёны: trousers→trs, dress→d, suit→st, blouse→top. */
export const TYPE_LAT: Record<string, string> = {
  "Платья": "d",          // dress
  "Летние платья": "d",
  "Брюки": "trs",         // trousers
  "Джинсы": "jns",        // jeans
  "Костюмы": "st",        // suit
  "Летние костюмы": "st",
  "Трикотажные костюмы": "kst", // knit set (джемпер+штаны)
  "Блузки": "top",        // blouse/top
  "Шорты": "sh",          // shorts
  "Юбки": "sk",           // skirt
  "Пальто": "ct",         // (обычно кириллица П_, латиница на всякий случай)
  "Полупальто": "hc",     // half coat (обычно ПП_)
};

/** Категория → кириллическая буква (для России, номерная схема). */
export const PREFIX_CYR: Record<string, string> = {
  "Пальто": "П",
  "Полупальто": "ПП",
  "Платья": "ПЛ",
  "Летние платья": "ПЛ",
  "Брюки": "Б",
  "Джинсы": "ДЖ",
  "Костюмы": "К",
  "Летние костюмы": "К",
  "Трикотажные костюмы": "ТК",
  "Блузки": "БЛ",
  "Шорты": "Ш",
  "Юбки": "Ю",
};

// ---------- Словарь цветов: русское название → код для артикула ----------
// РАБОЧАЯ ПАЛИТРА White One — 23 цвета, которые бренд реально шьёт (финал 2026-06-09).
// На наклейке ЧЗ печатается артикул (vendorCode) — китаец читает, поэтому код латиницей.
// Цвет вне этих 23 (графит, песочный, индиго…) уходит в транслит (grafit, pesochniy…).
// ⚠️ голубой=blue, синий=darkblue — историческая схема бренда (НЕ англ-буквальная).
// Ключи нормализованы (нижний регистр, ё→е). Ниже — алиасы разговорных форм.

export const COLOR_LAT: Record<string, string> = {
  // — Нейтральные —
  "белый": "white",
  "молочный": "milk",
  "черный": "black",
  "серый": "gray",
  "темно-серый": "darkgray",
  // — Бежевые / коричневые —
  "бежевый": "beige",
  "капучино": "cappuccino",
  "коричневый": "brown",
  "шоколадный": "chocolate",
  "хаки": "khaki",
  // — Красные / розовые —
  "красный": "red",
  "бордовый": "bordo",
  "вишня": "cherry",
  "розовый": "pink",
  // — Жёлтые / золото —
  "желтый": "yellow",
  "оранжевый": "orange",
  "золотой": "gold",
  // — Зелёные —
  "зеленый": "green",
  "оливковый": "olive",
  // — Синие (схема White One: голубой светлее синего) —
  "синий": "darkblue",
  "голубой": "blue",
  // — Фиолетовые —
  "фиолетовый": "purple",
  // — Металлик —
  "серебряный": "silver",

  // — Алиасы: короткие разговорные формы → тот же код —
  "молоко": "milk",
  "шоколад": "chocolate",
  "беж": "beige",
  "бордо": "bordo",
  "золото": "gold",
  "олива": "olive",
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

// Исключения для метки: международные фасон-термины, у которых транслит даёт кашу
// (палаццо→palatstso) или есть устоявшееся латинское написание. Остальные термины
// просто транслитерируются (bochki/klassika/kozha) — так понятнее русской команде.
const STYLE_OVERRIDES: Record<string, string> = {
  "палаццо": "palazzo",
  "классика": "classic",
  "бочки": "barrel",
  "баска": "baska",
  "кожа": "leather",
  "лен": "linen",          // нормализация ё→е делает «лён» → «лен»
  "овер": "over",
  "оверсайз": "over",
  "алладин": "aladdin",
  "аладдин": "aladdin",
  "офис": "office",
  "репаблик": "republic",
  "плиссе": "plisse",
  "кюлоты": "culottes",
  "карго": "cargo",
  "чинос": "chinos",
};

/** Латинский токен для слова метки: исключение из словаря или транслит. */
export function styleToken(word: string): string {
  return STYLE_OVERRIDES[normalize(word)] ?? translit(word);
}

// ---------- Сборка частей ----------

/** Код цвета: латиница из словаря (или транслит), либо полное русское слово для России. */
export function colorCode(colorName: string, latin: boolean): string {
  const norm = normalize(colorName);
  if (!latin) return norm.replace(/\s+/g, "-"); // Россия: полное русское слово как есть
  return COLOR_LAT[norm] ?? translit(colorName);
}

/**
 * Кандидаты «метки фасона» (вторая часть латинского артикула) из названия + особенностей.
 * Берём значимые слова (без слова-категории), транслитерируем, + вариант «всё слитно».
 * Кнопка «Перегенерировать» в форме перебирает этот список.
 * Напр. «Платье Кимоно Длинное» → ["kimono", "dlinnoe", "kimonodlinnoe"].
 * Чужие бренды отфильтрованы. Это дефолты — человек всегда может вписать своё.
 */
export function styleCandidates(modelName: string, category: string, subcategory?: string | null): string[] {
  const catWord = normalize(category).replace(/ы$|и$|а$|ие$|ые$/, ""); // «пальто/платья/трикотажные» → корень
  const raw = `${modelName ?? ""} ${subcategory ?? ""}`;
  const words = normalize(raw)
    .split(/[\s\-_,/]+/)
    .filter(Boolean)
    .filter((w) => catWord.length < 3 || !w.startsWith(catWord.slice(0, 4))) // выкидываем слово-категорию
    .filter((w) => w.length >= 2);

  const toks: string[] = [];
  for (const w of words) {
    const t = styleToken(w); // исключения (палаццо→palazzo) или транслит
    if (t.length >= 2 && !toks.includes(t) && !findBannedBrand(t)) toks.push(t);
  }
  // вариант «всё слитно» — на случай, если одиночные слова не нравятся
  const joined = words.map(styleToken).join("");
  if (joined.length >= 2 && !toks.includes(joined) && !findBannedBrand(joined)) toks.push(joined);

  if (toks.length === 0) {
    const fallback = translit(normalize(modelName));
    return fallback ? [fallback] : [];
  }
  return toks;
}

/**
 * Первый (дефолтный) вариант метки. Используется на сервере как фолбэк,
 * если пользователь не прислал метку.
 */
export function styleSuggest(modelName: string, category: string, subcategory?: string | null): string {
  return styleCandidates(modelName, category, subcategory)[0] ?? translit(normalize(modelName));
}

/** Двухзначный номер с ведущим нулём: 8 → "08", 12 → "12". */
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Латинская база: {тип}{NN}_{метка}.  Напр. trs08_palazzo.
 *  Категория+номер пишутся СЛИТНО, номер двухзначный (свой счётчик у категории). */
export function buildLatinBase(category: string, num: number, styleWord: string): string {
  const type = TYPE_LAT[category] ?? translit(category);
  const head = `${type}${pad2(num)}`;
  const style = translit(styleWord);
  return style ? `${head}_${style}` : head;
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
 * Полная сборка базы артикула фасона по КАТЕГОРИИ.
 * Пальто/полупальто → кириллица-номер; остальное → латиница-метка.
 */
export function buildModelBase(opts: {
  category: string;
  styleWord: string; // метка для латиницы (для пальто/полупальто игнорируется)
  russiaNumber?: number; // следующий номер для пальто/полупальто
  latinNumber?: number; // следующий номер для латиницы (брюки/платья/…)
}): string {
  if (usesCyrillicScheme(opts.category)) {
    return buildRussiaBase(opts.category, opts.russiaNumber ?? 1);
  }
  return buildLatinBase(opts.category, opts.latinNumber ?? 1, opts.styleWord);
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

/**
 * Извлечь номер из латинской базы («trs08_palazzo» → 8, «trs1atlas» → 1), иначе null.
 * Номер идёт сразу за кодом типа (слитно). Используется для счётчика категории.
 */
export function parseLatinNumber(category: string, base: string): number | null {
  const type = TYPE_LAT[category];
  if (!type) return null;
  const m = base.match(new RegExp(`^${type}(\\d+)`));
  return m ? Number(m[1]) : null;
}

// ======================================================
// СТОП-ЛИСТ БРЕНДОВ
// ======================================================
// В артикул (vendorCode на WB) нельзя вписывать чужие товарные знаки —
// WB такие карточки блокирует, плюс юридический риск. Проверяем «метку» фасона
// и название. Список курируемый и дополняемый. Слова ≥4 символов ищем как
// подстроку в «слитой» форме (ловит dress_maxmara_black), короткие аббревиатуры —
// только как отдельный токен (иначе ck/lv/hm ловились бы внутри обычных слов).

export const BANNED_BRANDS: string[] = [
  // латиница
  "chanel", "dior", "gucci", "prada", "versace", "balenciaga", "bottega", "veneta",
  "loewe", "celine", "givenchy", "balmain", "chloe", "lanvin", "kenzo", "moschino",
  "hermes", "birkin", "kelly", "burberry", "fendi", "valentino", "armani",
  "dolcegabbana", "gabbana", "miumiu", "saintlaurent", "louisvuitton", "vuitton",
  "cartier", "tiffany", "bvlgari", "bulgari", "maxmara", "massimodutti", "massimo",
  "zara", "bershka", "stradivarius", "pullbear", "uniqlo", "lacoste", "pinko",
  "nike", "adidas", "puma", "reebok", "newbalance", "tommyhilfiger", "calvinklein",
  "ralphlauren", "michaelkors", "offwhite", "stoneisland", "moncler", "canadagoose",
  "jacquemus", "toteme", "nanushka", "therow", "ganni",
  // кириллица
  "шанель", "диор", "гуччи", "прада", "версаче", "баленсиага", "боттега",
  "эрмес", "гермес", "биркин", "барбери", "бербери", "фенди", "валентино", "армани",
  "дольче", "габбана", "сенлоран", "живанши", "луивиттон", "виттон", "максмара",
  "зара", "бершка", "найк", "адидас", "пума", "рибок", "лакост", "москино",
  "картье", "тиффани", "монклер", "пинко", "массимо",
];

// Аббревиатуры брендов — матчим только как целый токен (не подстрока).
export const BANNED_ACRONYMS: string[] = ["ck", "lv", "dg", "mk", "ysl", "dkny"];

/**
 * Ищет чужой бренд в тексте (метка/название). Возвращает найденный бренд или null.
 */
export function findBannedBrand(text: string | null | undefined): string | null {
  const low = (text ?? "").toLowerCase().replace(/ё/g, "е");
  const letters = low.replace(/[^a-zа-я0-9]+/g, "");
  for (const b of BANNED_BRANDS) {
    if (b.length >= 4 && letters.includes(b)) return b;
  }
  const tokens = low.split(/[^a-zа-я0-9]+/).filter(Boolean);
  for (const a of BANNED_ACRONYMS) {
    if (tokens.includes(a)) return a;
  }
  return null;
}
