import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { IDEA_STATUS_LABELS, IDEA_STATUS_COLORS, IDEA_PRIORITY_LABELS, IDEA_PRIORITY_COLORS } from "@/lib/constants";
import { IdeaStatus, IdeaPriority } from "@prisma/client";

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const sp = await searchParams;
  const where: { status?: IdeaStatus; priority?: IdeaPriority } = {};
  if (sp.status && sp.status in IDEA_STATUS_LABELS) where.status = sp.status as IdeaStatus;
  if (sp.priority && sp.priority in IDEA_PRIORITY_LABELS) where.priority = sp.priority as IdeaPriority;

  const ideas = await prisma.idea.findMany({
    where,
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Пул идей</h1>
          <p className="text-sm text-slate-500">Всего: {ideas.length}</p>
        </div>
        <Link
          href="/ideas/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Добавить идею
        </Link>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <select name="status" defaultValue={sp.status ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Все статусы</option>
          {Object.entries(IDEA_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="priority" defaultValue={sp.priority ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Все приоритеты</option>
          {Object.entries(IDEA_PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="submit" className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
          Применить
        </button>
      </form>

      <div className="space-y-2">
        {ideas.map((i) => (
          <Link key={i.id} href={`/ideas/${i.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 hover:shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${IDEA_PRIORITY_COLORS[i.priority]}`}>
                    {IDEA_PRIORITY_LABELS[i.priority]}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs ${IDEA_STATUS_COLORS[i.status]}`}>
                    {IDEA_STATUS_LABELS[i.status]}
                  </span>
                </div>
                <div className="mt-1 font-medium text-slate-900">{i.title}</div>
                {i.description && <p className="mt-1 text-sm text-slate-600 line-clamp-2">{i.description}</p>}
                {i.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {i.tags.map((t) => (
                      <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">#{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-right text-xs text-slate-500">
                <div>{i.createdBy.name}</div>
                <div>{formatDate(i.createdAt)}</div>
              </div>
            </div>
          </Link>
        ))}
        {ideas.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
            Идей пока нет
          </div>
        )}
      </div>
    </div>
  );
}
