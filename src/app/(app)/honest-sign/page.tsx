import { buildHonestSignRows } from "./build-rows";
import { HonestSignTable } from "./honest-sign-table";
import { ExportButton } from "./export-button";
import { ChzFilesPanel, type ChzModelOption } from "./chz-files-panel";
import { DeclarationsPanel } from "./declarations-panel";
import { CHZ_BY_CATEGORY } from "@/lib/chz";

// Вкладка «Честный знак» — путь по шагам: категория → товары галочками →
// предпросмотр как в файле → IMPORT_K3 → GTIN обратно → справочник деклараций
// → IMPORT_RD. Справочная таблица строк — свёрнута внизу (ручная сверка).
export const dynamic = "force-dynamic";

export default async function HonestSignPage() {
  const rows = await buildHonestSignRows();

  // Категории — только замапленные на шаблон ЧЗ; фасоны с числом строк для шага 2.
  const categories = Array.from(new Set(rows.map((r) => r.category))).filter((c) => CHZ_BY_CATEGORY[c]);
  const modelsByCategory: Record<string, ChzModelOption[]> = {};
  for (const c of categories) {
    const byModel = new Map<string, ChzModelOption>();
    for (const r of rows) {
      if (r.category !== c) continue;
      const m = byModel.get(r.modelId);
      if (m) m.rows += 1;
      else byModel.set(r.modelId, { id: r.modelId, name: r.modelName, rows: 1 });
    }
    modelsByCategory[c] = Array.from(byModel.values()).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Честный знак</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Заведение карточек в Национальный каталог «Честный знак»: файл собирается из данных
          кабинета, столбцы — строго как в шаблоне ЧЗ.
        </p>
      </div>

      <ChzFilesPanel categories={categories} modelsByCategory={modelsByCategory} />

      <DeclarationsPanel categories={categories} />

      {/* Справочная таблица — НЕ файл для ЧЗ, ручная сверка/копирование ячеек */}
      <details className="rounded-2xl bg-white p-4 dark:bg-slate-900">
        <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300">
          Справочная таблица строк (ручная сверка — это не файл для загрузки в ЧЗ)
        </summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-2xl text-xs text-slate-500">
              Одна строка = цветомодель × размер. Кликните ячейку — значение копируется в буфер;
              клик по «№» строки копирует всю строку через таб. Пустые ТНВЭД / состав / цвет
              подсвечены — это дыры, которые нужно заполнить для ЧЗ.
            </p>
            <ExportButton />
          </div>
          <HonestSignTable rows={rows} />
        </div>
      </details>
    </div>
  );
}
