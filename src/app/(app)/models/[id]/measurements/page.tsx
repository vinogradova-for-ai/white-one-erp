import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MeasurementsEditor } from "@/components/models/measurements-editor";

// Экран замеров фасона (мерочный лист): размеры × параметры → см.
// Заполняет продуктовый отдел при разработке (импорт вставкой из Excel-МЛ).
// Отсюда сетка уезжает в Студию и в карточку ВБ (ТЗ Студии, этап 2).

export default async function MeasurementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await prisma.productModel.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      artikulBase: true,
      sizeGrid: { select: { sizes: true } },
      measurements: { orderBy: [{ param: "asc" }, { size: "asc" }] },
    },
  });
  if (!model) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/models/${model.id}`} className="text-sm text-slate-500 hover:underline">
          ← {model.name}
        </Link>
        <h1 className="text-xl font-semibold">Замеры (мерочный лист)</h1>
      </div>
      <MeasurementsEditor
        modelId={model.id}
        gridSizes={model.sizeGrid?.sizes ?? []}
        initial={model.measurements.map((m) => ({ size: m.size, param: m.param, valueCm: m.valueCm }))}
      />
    </div>
  );
}
