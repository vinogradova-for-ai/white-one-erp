import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { IDEA_STATUS_LABELS, IDEA_STATUS_COLORS, IDEA_PRIORITY_LABELS, IDEA_PRIORITY_COLORS } from "@/lib/constants";
import { IdeaStatusActions } from "@/components/ideas/idea-status-actions";

export default async function IdeaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idea = await prisma.idea.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      promotedToModel: { select: { id: true, name: true } },
    },
  });

  if (!idea) return notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs ${IDEA_PRIORITY_COLORS[idea.priority]}`}>
              {IDEA_PRIORITY_LABELS[idea.priority]}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs ${IDEA_STATUS_COLORS[idea.status]}`}>
              {IDEA_STATUS_LABELS[idea.status]}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">{idea.title}</h1>
          <div className="mt-1 text-sm text-slate-500">
            Автор: {idea.createdBy.name} · {formatDate(idea.createdAt)}
          </div>
        </div>
      </div>

      {idea.description && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="whitespace-pre-line text-sm text-slate-700">{idea.description}</p>
        </div>
      )}

      {idea.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {idea.tags.map((t) => (
            <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">#{t}</span>
          ))}
        </div>
      )}

      {idea.rejectedReason && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-semibold uppercase text-slate-500">Причина отклонения</div>
          <p className="mt-1 text-sm text-slate-700">{idea.rejectedReason}</p>
        </div>
      )}

      {idea.promotedToModel && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-xs font-semibold uppercase text-emerald-700">Промотирована в фасон</div>
          <Link
            href={`/models/${idea.promotedToModel.id}`}
            className="mt-1 block text-sm font-medium text-emerald-900 hover:underline"
          >
            {idea.promotedToModel.name} →
          </Link>
        </div>
      )}

      {idea.status !== "PROMOTED" && (
        <IdeaStatusActions
          ideaId={idea.id}
          currentStatus={idea.status}
          title={idea.title}
          tags={idea.tags}
        />
      )}
    </div>
  );
}
