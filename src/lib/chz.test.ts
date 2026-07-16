import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  CHZ_COLORS,
  CHZ_BY_CATEGORY,
  buildChzRow,
  chzColor,
  chzFullName,
  tnvedShort,
} from "./chz";

// Эталонный шаблон ЧЗ (закоммичен в docs/chz-templates) — источник справочников.
const TEMPLATE = path.join(
  process.cwd(),
  "docs/chz-templates",
  "IMPORT_K3_Пальто,_полупальто,_накидки,_плащи (2).xlsx",
);

let dictColors: Set<string>;
let dictKinds: Set<string>;

beforeAll(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.getWorksheet("Справочники");
  if (!ws) throw new Error("нет листа Справочники в эталоне");
  dictColors = new Set();
  dictKinds = new Set();
  ws.eachRow((row) => {
    const key = String(row.getCell(1).value ?? "").trim();
    const val = String(row.getCell(2).value ?? "").trim();
    if (key === "Цвет" && val) dictColors.add(val);
    if (key === "Вид товара" && val) dictKinds.add(val);
  });
});

describe("словари ЧЗ против эталонного шаблона", () => {
  it("справочник цветов прочитан (77 значений)", () => {
    expect(dictColors.size).toBe(77);
  });

  it("каждый наш цвет мапится в существующий цвет справочника ЧЗ", () => {
    const bad = Object.entries(CHZ_COLORS).filter(([, v]) => !dictColors.has(v));
    expect(bad, `не в справочнике ЧЗ: ${bad.map(([k, v]) => `${k}→${v}`).join(", ")}`).toEqual([]);
  });

  it("каждый вид товара из маппинга категорий есть в справочнике ЧЗ", () => {
    const bad = Object.values(CHZ_BY_CATEGORY)
      .map((t) => t.productKind)
      .filter((k) => !dictKinds.has(k));
    expect(bad, `не в справочнике: ${bad.join(", ")}`).toEqual([]);
  });
});

describe("сборка строки", () => {
  const input = {
    category: "Пальто",
    sku: "П_025_беж",
    colorName: "Бежевый",
    size: "42",
    tnvedCode: "6202900001",
    composition: "Шерсть 60%, вискоза 35%, лайкра 5%",
  };

  it("полное наименование как в примере Алёны", () => {
    const row = buildChzRow(input);
    expect("error" in row).toBe(false);
    if (!("error" in row)) {
      expect(row.fullName).toBe("Пальто женское, П_025_беж, 42, цвет бежевый");
      expect(row.tnvedShort).toBe("6202");
      expect(row.categoryCode).toBe("238965");
      expect(row.chzColor).toBe("БЕЖЕВЫЙ");
      expect(row.status).toBe("Черновик");
    }
  });

  it("неизвестный цвет — понятная ошибка", () => {
    const row = buildChzRow({ ...input, colorName: "перламутровый закат" });
    expect(row).toEqual({ error: "цвет «перламутровый закат» не из справочника ЧЗ" });
  });

  it("кривой ТНВЭД — ошибка", () => {
    const row = buildChzRow({ ...input, tnvedCode: "6202" });
    expect(row).toEqual({ error: "ТНВЭД должен быть 10 знаков" });
  });

  it("рубашки идут в шаблон блузок с видом РУБАШКА", () => {
    const row = buildChzRow({ ...input, category: "Рубашки", sku: "rub03_kruzhevo_white", colorName: "белый" });
    if (!("error" in row)) {
      expect(row.categoryCode).toBe("238944");
      expect(row.productKind).toBe("РУБАШКА");
      expect(row.fullName).toContain("Рубашка женская");
    } else {
      throw new Error(row.error);
    }
  });

  it("вспомогательные: цвет и тнвэд", () => {
    expect(chzColor("Шоколад")).toBe("ШОКОЛАДНЫЙ");
    expect(tnvedShort("6202 90 000 1")).toBe("6202");
    expect(
      chzFullName({ fullNameNoun: "Брюки женские", sku: "trs07_barrel", size: "46", chzColorValue: "ЧЕРНЫЙ" }),
    ).toBe("Брюки женские, trs07_barrel, 46, цвет черный");
  });
});
