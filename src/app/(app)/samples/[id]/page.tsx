import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, formatDateTime } from "@/lib/format";
import { SAMPLE_STATUS_LABELS, SAMPLE_STATUS_COLORS } from "@/lib/constants";
import { PhotoGallery } from "@/components/common/photo-thumb";
import { SampleStatusChanger } from "@/components/samples/sample-status-changer";

export default async function SampleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sample = await prisma.sample.findFirst({
    where: { id },
    include: {
      productModel: { select: { id: true, name: true, category: true, photoUrls: true } },
      productVariant: { select: { id: true, sku: true, colorName: true, photoUrls: true } },
      approvedBy: { select: { name: true } },
      statusLogs: {
        orderBy: { changedAt: "desc" },
        take: 20,
        include: { changedBy: { select: { name: true } } },
      },
    },
  });

  if (!sample) return notFound();

  const photos = sample.productVariant?.photoUrls?.length
    ? sample.productVariant.photoUrls
    : sample.productModel.photoUrls;

  return (
    <div className="space-y-6">
      <div className="flex justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500">Образец</div>
          <h1 className="text-2xl font-semibold text-slate-900">
            <Link href={`/models/${sample.productModel.id}`} className="hover:underline">
              {sample.productModel.name}
            </Link>
            {sample.productVariant && (
              <>
                {" · "}
                <Link href={`/variants/${sample.productVariant.id}`} className="hover:underline text-slate-700">
                  {sample.productVariant.colorName}
                </Link>
              </>
            )}
          </h1>
          <div className="mt-1">
            <span className={`inline-block rounded px-2 py-0.5 text-xs ${SAMPLE_STATUS_COLORS[sample.status]}`}>
              {SAMPLE_STATUS_LABELS[sample.status]}
            </span>
          </div>
        </div>
        <SampleStatusChanger sampleId={sample.id} currentStatus={sample.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <PhotoGallery urls={photos} alt={sample.productModel.name} />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Даты pipeline">
            <Row label="Заказан на фабрике" value={formatDate(sample.requestDate)} />
            <Row label="Пошив начат" value={formatDate(sample.sewingStartDate)} />
            <Row label="Доставлен в Москву" value={formatDate(sample.deliveredDate)} />
            <Row label="Утверждён" value={formatDate(sample.approvedDate)} />
            <Row label="Готов к съёмке" value={formatDate(sample.readyForShootDate)} />
            <Row label="Возвращён" value={formatDate(sample.returnedDate)} />
          </Card>

          {sample.status !== "REQUESTED" && sample.status !== "IN_SEWING" && (
            <Card title="Утверждение">
              <Row label="Кем утверждён" value={sample.approvedBy?.name ?? "—"} />
              <Row label="Когда" value={formatDate(sample.approvedDate)} />
              {sample.approvalComment && (
                <Row label="Комментарий" value={<span className="whitespace-pre-line">{sample.approvalComment}</span>} />
              )}
              {sample.approvedPhotoUrl && (
                <Row label="Фото утверждённого образца" value={
                  <a href={sample.approvedPhotoUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline">открыть</a>
                } />
              )}
            </Card>
          )}

          <Card title="Для контент-отдела">
            <Row label="Съёмка запланирована" value={formatDate(sample.plannedShootDate)} />
            <Row label="Съёмка проведена" value={sample.shootCompleted ? "Да ✓" : "Нет"} />
          </Card>

          {sample.notes && (
            <Card title="Примечания">
              <p className="whitespace-pre-line text-sm text-slate-700">{sample.notes}</p>
            </Card>
          )}
        </div>
      </div>

      <Card title="История статусов">
        <ul className="space-y-2 text-sm">
          {sample.statusLogs.map((log) => (
            <li key={log.id} className="flex justify-between gap-4 border-b border-slate-100 pb-2 last:border-0">
              <div>
                <span className="text-slate-500">{log.fromStatus ? SAMPLE_STATUS_LABELS[log.fromStatus] : "—"}</span>
                <span className="mx-2 text-slate-400">→</span>
                <span className="font-medium text-slate-900">{SAMPLE_STATUS_LABELS[log.toStatus]}</span>
                {log.comment && <div className="text-xs text-slate-500">{log.comment}</div>}
              </div>
              <div className="text-right text-xs text-slate-500">
                {formatDateTime(log.changedAt)}
                <div>{log.changedBy.name}</div>
              </div>
            </li>
          ))}
          {sample.statusLogs.length === 0 && <li className="text-slate-500">История пуста</li>}
        </ul>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="text-right text-slate-900">{value}</span>
    </div>
  );
}
