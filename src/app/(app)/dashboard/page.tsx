import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  getMainScreenChecklist,
  groupByOwner,
  zoneOf,
  type ChecklistTask,
  type TaskUrgency,
  type TaskZone,
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

const ORDER_KINDS: ChecklistTask["kind"][] = ["order-qc", "accept-qc", "check-delivery"];

const ZONES: Array<{ key: TaskZone; title: string; muted: boolean }> = [
  { key: "now", title: "Сейчас", muted: false },
  { key: "this-week", title: "На неделе", muted: false },
  { key: "next-week", title: "Следующая неделя", muted: true },
];

function ChecklistGroup({ tasks }: { tasks: ChecklistTask[] }) {
  return (
    <div className="space-y-10">
      {ZONES.map((zone) => {
        const zoneTasks = tasks.filter((t) => zoneOf(t.urgency) === zone.key);
        if (zoneTasks.length === 0) return null;
        return (
          <Zone key={zone.key} title={zone.title} count={zoneTasks.length} muted={zone.muted}>
            <ZoneBody tasks={zoneTasks} showIdle={zone.key === "now"} />
          </Zone>
        );
      })}
    </div>
  );
}

function ZoneBody({ tasks, showIdle }: { tasks: ChecklistTask[]; showIdle: boolean }) {
  const orderTasks = tasks.filter((t) => ORDER_KINDS.includes(t.kind));
  const devTasks = tasks.filter((t) => !ORDER_KINDS.includes(t.kind));
  const devWithDeadline = devTasks.filter((t) => t.daysToDeadline !== null);
  const devIdle = devTasks.filter((t) => t.daysToDeadline === null);
  // Счётчик «накопленного долга» — задачи разработки с возрастом >30 дн.
  // Показываем только в зоне «Сейчас» (showIdle=true) — это сигнал «копится».
  const longStuck = showIdle ? devTasks.filter((t) => (t.ageInDays ?? 0) > 30).length : 0;

  return (
    <div className="space-y-6">
      {orderTasks.length > 0 && (
        <Section title="Заказы" count={orderTasks.length}>
          <TaskList tasks={orderTasks} />
        </Section>
      )}
      {(devWithDeadline.length > 0 || (showIdle && devIdle.length > 0)) && (
        <Section
          title="Разработка"
          count={devTasks.length}
          rightHint={longStuck > 0 ? `в разработке >30 дн: ${longStuck}` : undefined}
        >
          <div className="space-y-4">
            {devWithDeadline.length > 0 && <TaskList tasks={devWithDeadline} />}
            {showIdle && devIdle.length > 0 && (
              <div>
                <div className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Давно не двигалось
                </div>
                <TaskList tasks={devIdle} />
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function Zone({
  title,
  count,
  muted,
  children,
}: {
  title: string;
  count: number;
  muted: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={muted ? "opacity-75" : ""}>
      <div className="mb-4 flex items-baseline gap-3 border-b border-slate-200 pb-1">
        <h2 className={`text-base font-semibold ${muted ? "text-slate-500" : "text-slate-900"}`}>
          {title}
        </h2>
        <span className="text-xs text-slate-400">{count}</span>
      </div>
      {children}
    </section>
  );
}

function Section({
  title,
  count,
  rightHint,
  children,
}: {
  title: string;
  count: number;
  rightHint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
        <span className="text-xs text-slate-400">{count}</span>
        {rightHint && (
          <span className="ml-auto text-xs text-orange-600">{rightHint}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function TaskList({ tasks }: { tasks: ChecklistTask[] }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {tasks.map((t) => (
        <ChecklistRow key={t.id} task={t} />
      ))}
    </ul>
  );
}

function ChecklistRow({ task }: { task: ChecklistTask }) {
  // Цвет рамки для задач разработки — старение по возрасту фасона:
  //   0-7 дн   — без рамки (нейтрально)
  //   8-21 дн  — жёлтая (внимание)
  //   22-44 дн — оранжевая (долг)
  //   45+ дн   — красная (длительный простой)
  const age = task.ageInDays;
  const ageBorder =
    age === null ? "" :
    age >= 45 ? "border-l-4 border-l-red-400" :
    age >= 22 ? "border-l-4 border-l-orange-400" :
    age >= 8 ? "border-l-4 border-l-amber-300" :
    "";
  return (
    <li className={ageBorder}>
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
      : urgency === "this-week"
      ? "bg-slate-300"
      : urgency === "next-week"
      ? "bg-slate-200"
      : "bg-slate-200";
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls}`} aria-hidden />;
}
