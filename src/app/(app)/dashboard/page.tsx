import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  getMainScreenChecklist,
  groupByOwner,
  type ChecklistTask,
  type TaskUrgency,
} from "@/lib/queries/main-screen-checklist";
import type { Role } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const userName = session?.user?.name ?? "";
  const role = (session?.user as { role?: Role } | undefined)?.role;
  const myId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const isAdmin = role === "OWNER" || role === "DIRECTOR";

  const all = await getMainScreenChecklist();
  const groups = groupByOwner(all);

  // Не-админ видит только свою подвкладку и в неё всегда переключён.
  const visibleGroups = isAdmin ? groups : groups.filter((g) => g.ownerId === myId);
  const selectedOwnerId = isAdmin
    ? (sp.owner && visibleGroups.some((g) => g.ownerId === sp.owner) ? sp.owner : visibleGroups[0]?.ownerId)
    : myId;
  const selected = visibleGroups.find((g) => g.ownerId === selectedOwnerId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Добрый день, {userName}</h1>
        {all.length > 0 ? (
          <p className="text-sm text-slate-600">
            Задач на ближайшие дни: <b>{all.length}</b>
          </p>
        ) : (
          <p className="text-sm text-emerald-700">Всё под контролем. Срочного нет.</p>
        )}
      </div>

      {isAdmin && visibleGroups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visibleGroups.map((g) => {
            const isActive = g.ownerId === selectedOwnerId;
            const overdue = g.tasks.filter((t) => t.urgency === "overdue").length;
            return (
              <Link
                key={g.ownerId}
                href={`/dashboard?owner=${g.ownerId}`}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                <span>{g.ownerName}</span>
                <span
                  className={`rounded-full px-1.5 text-xs font-semibold ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {g.tasks.length}
                </span>
                {overdue > 0 && (
                  <span className="rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                    {overdue}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {selected ? (
        <ChecklistGroup tasks={selected.tasks} />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Срочных задач нет.
        </div>
      )}
    </div>
  );
}

function ChecklistGroup({ tasks }: { tasks: ChecklistTask[] }) {
  const withDeadline = tasks.filter((t) => t.daysToDeadline !== null);
  const idle = tasks.filter((t) => t.daysToDeadline === null);

  return (
    <div className="space-y-6">
      {withDeadline.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {withDeadline.map((t) => (
            <ChecklistRow key={t.id} task={t} />
          ))}
        </ul>
      )}
      {idle.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Давно не двигалось
          </h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {idle.map((t) => (
              <ChecklistRow key={t.id} task={t} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ task }: { task: ChecklistTask }) {
  return (
    <li>
      <Link
        href={task.href}
        className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50"
      >
        <UrgencyDot urgency={task.urgency} />
        <span
          className={`flex-1 ${
            task.urgency === "overdue" ? "font-medium text-red-700" : "text-slate-800"
          }`}
        >
          {task.text}
        </span>
      </Link>
    </li>
  );
}

function UrgencyDot({ urgency }: { urgency: TaskUrgency }) {
  const cls =
    urgency === "overdue"
      ? "bg-red-500"
      : urgency === "soon"
      ? "bg-amber-400"
      : urgency === "later"
      ? "bg-slate-300"
      : "bg-slate-200";
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} aria-hidden />;
}
