import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { SAMPLE_STATUS_LABELS, SAMPLE_STATUS_COLORS, SAMPLE_STATUS_ORDER } from "@/lib/constants";
import { PhotoThumb } from "@/components/common/photo-thumb";
import { SampleStatus } from "@prisma/client";

export default async function SamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const where: { status?: SampleStatus } = {};
  if (sp.status && sp.status in SAMPLE_STATUS_LABELS) where.status = sp.status as SampleStatus;

  const samples = await prisma.sample.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      productModel: { select: { id: true, name: true, category: true, ownerId: true } },
      productVariant: { select: { id: true, sku: true, colorName: true, photoUrls: true } },
    },
  });

  // Группировка по статусу — канбан-вид
  const byStatus = SAMPLE_STATUS_ORDER.map((s) => ({
    status: s,
    label: SAMPLE_STATUS_LABELS[s],
    items: samples.filter((x) => x.status === s),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Образцы</h1>
        <p className="text-sm text-slate-500">Всего в работе: {samples.filter((s) => s.status !== "RETURNED").length}</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {byStatus.map((col) => (
          <div key={col.status} className="w-72 flex-shrink-0">
            <div className={`mb-2 rounded-lg px-3 py-2 text-sm font-medium ${SAMPLE_STATUS_COLORS[col.status]}`}>
              {col.label} <span className="ml-1 text-xs">({col.items.length})</span>
            </div>
            <div className="space-y-2">
              {col.items.map((s) => (
                <Link
                  key={s.id}
                  href={`/samples/${s.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-3 hover:shadow-md"
                >
                  <div className="flex gap-2">
                    <PhotoThumb url={s.productVariant?.photoUrls[0]} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 line-clamp-1">
                        {s.productModel.name}
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-1">
                        {s.productVariant?.colorName ?? "—"}
                      </div>
                      {s.plannedShootDate && (
                        <div className="mt-1 text-xs text-pink-600">📷 съёмка {formatDate(s.plannedShootDate)}</div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              {col.items.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                  пусто
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
