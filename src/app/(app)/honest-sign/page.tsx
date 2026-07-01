import { buildHonestSignRows } from "./build-rows";
import { HonestSignTable } from "./honest-sign-table";
import { ExportButton } from "./export-button";

// Вкладка «Честный знак» — витрина справочника для ВЭД / WB-менеджеров.
// Одна строка = цветомодель × размер по всем активным фасонам.
// Только чтение: копирование ячеек/строк в буфер + выгрузка в Excel.
export const dynamic = "force-dynamic";

export default async function HonestSignPage() {
  const rows = await buildHonestSignRows();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Честный знак</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Справочник для Национального каталога «Честный знак»: одна строка =
            цветомодель × размер. Кликните ячейку — значение копируется в буфер;
            клик по «№» строки копирует всю строку через таб (для вставки в
            Excel/формы). Пустые ТНВЭД / состав / цвет подсвечены — это дыры,
            которые нужно заполнить для ЧЗ.
          </p>
        </div>
        <ExportButton />
      </div>

      <HonestSignTable rows={rows} />
    </div>
  );
}
