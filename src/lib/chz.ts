/**
 * Честный знак: словари и сборка строк для шаблонов импорта (Алёна 16.07).
 *
 * Загрузка товаров в Нацкаталог идёт категорийными xlsx-шаблонами IMPORT_K3
 * (у каждой товарной группы свой код категории и свой лист, структура колонок
 * одинаковая). Эталонные шаблоны лежат в docs/chz-templates/ — генератор
 * заполняет КОПИЮ эталона, чтобы справочники и формат остались нетронутыми.
 *
 * Правила:
 *  - Цвет — СТРОГО из справочника ЧЗ (77 значений капсом). Наши цвета мапим
 *    словарём ниже; неизвестный цвет — дыра данных, в файл не пишем.
 *  - Вид товара — из справочника ЧЗ (ПАЛЬТО, ПЛАТЬЕ, …), мапится с категории.
 *  - Полное наименование: «Пальто женское, П_025_беж, 42, цвет бежевый».
 *  - Товарный знак: White One Love.
 *  - Техрегламент: ТР ТС 017/2011 (лёгкая промышленность) — у всей одежды.
 */

export const CHZ_BRAND = "White One Love";
export const CHZ_TECH_REG = 'ТР ТС 017/2011 "О безопасности продукции легкой промышленности"';

// Тип разрешительного документа в IMPORT_RD (идентификаторы ЧЗ).
export const CHZ_RD_TYPE_IDS: Record<string, string> = {
  DECLARATION: "23557",
  CERTIFICATE: "23561",
};

/** Наша категория → шаблон ЧЗ. file — имя эталона в docs/chz-templates. */
export type ChzTemplate = {
  categoryCode: string;   // код категории ЧЗ (= имя листа IMPORT_CATEGORY_{code})
  file: string;
  productKind: string;    // «Вид товара» из справочника ЧЗ
  fullNameNoun: string;   // «Пальто женское» — начало полного наименования
};

export const CHZ_BY_CATEGORY: Record<string, ChzTemplate> = {
  "Пальто":      { categoryCode: "238965", file: "IMPORT_K3_Пальто,_полупальто,_накидки,_плащи (2).xlsx", productKind: "ПАЛЬТО",     fullNameNoun: "Пальто женское" },
  "Полупальто":  { categoryCode: "238965", file: "IMPORT_K3_Пальто,_полупальто,_накидки,_плащи (2).xlsx", productKind: "ПОЛУПАЛЬТО", fullNameNoun: "Полупальто женское" },
  "Платья":      { categoryCode: "30684",  file: "IMPORT_K3_Платья.xlsx",                                  productKind: "ПЛАТЬЕ",     fullNameNoun: "Платье женское" },
  "Летние платья": { categoryCode: "30684", file: "IMPORT_K3_Платья.xlsx",                                 productKind: "ПЛАТЬЕ",     fullNameNoun: "Платье женское" },
  "Сарафаны":    { categoryCode: "30684",  file: "IMPORT_K3_Платья.xlsx",                                  productKind: "САРАФАН",    fullNameNoun: "Сарафан женский" },
  "Юбки":        { categoryCode: "30685",  file: "IMPORT_K3_Юбки_и_юбки-брюки.xlsx",                       productKind: "ЮБКА",       fullNameNoun: "Юбка женская" },
  "Блузки":      { categoryCode: "238944", file: "IMPORT_K3_Блузки,_блузы_и_блузоны.xlsx",                 productKind: "БЛУЗКА",     fullNameNoun: "Блузка женская" },
  "Рубашки":     { categoryCode: "238944", file: "IMPORT_K3_Блузки,_блузы_и_блузоны.xlsx",                 productKind: "РУБАШКА",    fullNameNoun: "Рубашка женская" },
  "Костюмы":     { categoryCode: "30696",  file: "IMPORT_K3_Костюмы_и_комплекты.xlsx",                     productKind: "КОСТЮМ",     fullNameNoun: "Костюм женский" },
  "Летние костюмы": { categoryCode: "30696", file: "IMPORT_K3_Костюмы_и_комплекты.xlsx",                   productKind: "КОСТЮМ",     fullNameNoun: "Костюм женский" },
  "Трикотажные костюмы": { categoryCode: "30696", file: "IMPORT_K3_Костюмы_и_комплекты.xlsx",              productKind: "КОСТЮМ",     fullNameNoun: "Костюм женский" },
  "Брюки":       { categoryCode: "30683",  file: "IMPORT_K3_Брюки,_бриджи,_шорты (1).xlsx",                productKind: "БРЮКИ",      fullNameNoun: "Брюки женские" },
  "Джинсы":      { categoryCode: "30683",  file: "IMPORT_K3_Брюки,_бриджи,_шорты (1).xlsx",                productKind: "ДЖИНСЫ",     fullNameNoun: "Джинсы женские" },
  "Шорты":       { categoryCode: "30683",  file: "IMPORT_K3_Брюки,_бриджи,_шорты (1).xlsx",                productKind: "ШОРТЫ",      fullNameNoun: "Шорты женские" },
};

/**
 * Наш цвет → цвет справочника ЧЗ (77 значений).
 * Ключи нормализованы (нижний регистр, ё→е). Тест chz.test.ts проверяет,
 * что каждое значение реально есть в справочнике эталонного шаблона.
 */
export const CHZ_COLORS: Record<string, string> = {
  "белый": "БЕЛЫЙ",
  "молочный": "МОЛОЧНЫЙ",
  "молоко": "МОЛОЧНЫЙ",
  "черный": "ЧЕРНЫЙ",
  "серый": "СЕРЫЙ",
  "темно-серый": "ТЕМНО-СЕРЫЙ",
  "графит": "АНТРАЦИТОВЫЙ",
  "антрацит": "АНТРАЦИТОВЫЙ",
  "бежевый": "БЕЖЕВЫЙ",
  "беж": "БЕЖЕВЫЙ",
  "капучино": "КАПУЧИНО",
  "коричневый": "КОРИЧНЕВЫЙ",
  "шоколадный": "ШОКОЛАДНЫЙ",
  "шоколад": "ШОКОЛАДНЫЙ",
  "мокка": "КОРИЧНЕВЫЙ",
  "хаки": "ХАКИ",
  "красный": "КРАСНЫЙ",
  "бордовый": "БОРДОВЫЙ",
  "бордо": "БОРДОВЫЙ",
  "вишня": "ВИШНЯ",
  "вишневый": "ВИШНЯ",
  "розовый": "РОЗОВЫЙ",
  "пудровый": "СВЕТЛО-РОЗОВЫЙ",
  "желтый": "ЖЁЛТЫЙ",
  "оранжевый": "ОРАНЖЕВЫЙ",
  "золотой": "ЗОЛОТОЙ",
  "золото": "ЗОЛОТОЙ",
  "зеленый": "ЗЕЛЁНЫЙ",
  "оливковый": "ОЛИВКОВЫЙ",
  "олива": "ОЛИВКОВЫЙ",
  "синий": "СИНИЙ",
  "темно-синий": "ТЕМНО-СИНИЙ",
  "голубой": "ГОЛУБОЙ",
  "фиолетовый": "ФИОЛЕТОВЫЙ",
  "сиреневый": "СИРЕНЕВЫЙ",
  "серебряный": "СЕРЕБРЯНЫЙ",
  "серебро": "СЕРЕБРЯНЫЙ",

  // — Реальные написания из базы (16.07): склонения, сокращения, синонимы —
  "белая": "БЕЛЫЙ",
  "голубые": "ГОЛУБОЙ",
  "джинсовый": "СИНИЙ",
  "кирпичный": "КИРПИЧНЫЙ",
  "корич": "КОРИЧНЕВЫЙ",
  "коричневые": "КОРИЧНЕВЫЙ",
  "мокко": "КОРИЧНЕВЫЙ",
  "темно-синие": "ТЕМНО-СИНИЙ",
  "темносиний": "ТЕМНО-СИНИЙ",
  "ягодный": "МАЛИНОВЫЙ",
  "ягодный красный": "МАЛИНОВЫЙ",
};

export function normalizeColor(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/^\d+\s+/, "") // «138 хаки» — цвет с кодом ткани поставщика
    .replace(/\s+/g, " ");
}

/** Цвет ЧЗ или null (дыра данных — «цвет не из справочника ЧЗ»). */
export function chzColor(colorName: string): string | null {
  return CHZ_COLORS[normalizeColor(colorName)] ?? null;
}

/** «Пальто женское, П_025_беж, 42, цвет бежевый» */
export function chzFullName(opts: {
  fullNameNoun: string;
  sku: string;
  size: string;
  chzColorValue: string;
}): string {
  return `${opts.fullNameNoun}, ${opts.sku}, ${opts.size}, цвет ${opts.chzColorValue.toLowerCase()}`;
}

/** Короткий ТНВЭД (4 знака) из полного 10-значного. */
export function tnvedShort(tnved: string): string {
  return tnved.replace(/\D/g, "").slice(0, 4);
}

export type ChzRowInput = {
  category: string;
  sku: string;           // артикул цвета (vendorCode)
  colorName: string;
  size: string;
  tnvedCode: string;     // полный 10 знаков
  composition: string;   // состав
};

export type ChzRow = {
  tnvedShort: string;
  categoryCode: string;
  isKit: "нет";
  fullName: string;
  brand: string;
  artikul: string;
  productKind: string;
  chzColor: string;
  gender: "ЖЕНСКИЙ";
  sizeSystem: "РОССИЯ";
  size: string;
  composition: string;
  tnvedFull: string;
  techReg: string;
  status: "Черновик";
};

/** Собрать строку шаблона; бросает только на неизвестной категории. */
export function buildChzRow(r: ChzRowInput): ChzRow | { error: string } {
  const t = CHZ_BY_CATEGORY[r.category];
  if (!t) return { error: `категория «${r.category}» не замаплена на шаблон ЧЗ` };
  const color = chzColor(r.colorName);
  if (!color) return { error: `цвет «${r.colorName}» не из справочника ЧЗ` };
  if (!r.tnvedCode || r.tnvedCode.replace(/\D/g, "").length !== 10)
    return { error: "ТНВЭД должен быть 10 знаков" };
  if (!r.composition?.trim()) return { error: "нет состава" };

  return {
    tnvedShort: tnvedShort(r.tnvedCode),
    categoryCode: t.categoryCode,
    isKit: "нет",
    fullName: chzFullName({ fullNameNoun: t.fullNameNoun, sku: r.sku, size: r.size, chzColorValue: color }),
    brand: CHZ_BRAND,
    artikul: r.sku,
    productKind: t.productKind,
    chzColor: color,
    gender: "ЖЕНСКИЙ",
    sizeSystem: "РОССИЯ",
    size: r.size,
    composition: r.composition.trim(),
    tnvedFull: r.tnvedCode.replace(/\D/g, ""),
    techReg: CHZ_TECH_REG,
    status: "Черновик",
  };
}
