import Link from "next/link";
import { auth } from "@/lib/auth";
import { getMyTasks, CATEGORY_LABELS, type MyTask } from "@/lib/queries/my-tasks";
import { PhotoThumb } from "@/components/common/photo-thumb";

export default async function MyTasksPage() {
  const session = await auth();
  if (!session?.user) return null;

  const tasks = await getMyTasks(session.user.id, session.user.role);

  const overdueCount = tasks.filter((t) => t.urgency === "overdue").length;
  const urgentCount = tasks.filter((t) => t.urgency === "urgent").length;

  // Группировка по категории
  const grouped = tasks.reduce((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {} as Record<MyTask["category"], MyTask[]>);

  const groupOrder: MyTask["category"][] = [
    "receiving", "packing", "shipping", "customs", "sample", "content", "discovery", "production",
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Мои задачи</h1>
        <div className="mt-1 flex items-center gap-3 text-sm">
          <span className="text-slate-500">Всего: {tasks.length}</span>
          {overdueCount > 0 && (
            <span className="rounded bg-red-100 px-2 py-0.5 font-medium text-red-700">
              Просрочено: {overdueCount}
            </span>
          )}
          {urgentCount > 0 && (
            <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
              Срочно: {urgentCount}
            </span>
          )}
        </div>
      </div>

      {tasks.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <div className="text-4xl">✓</div>
          <p className="mt-2 text-slate-600">Задач нет. Отличная работа!</p>
        </div>
      )}

      {groupOrder
        .filter((cat) => grouped[cat] && grouped[cat].length > 0)
        .map((cat) => (
          <section key={cat}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {CATEGORY_LABELS[cat]}
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                {grouped[cat].length}
              </span>
            </h2>
            <div className="space-y-2">
              {grouped[cat].map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function TaskCard({ task }: { task: MyTask }) {
  const urgencyStyles = {
    overdue: "border-red-300 bg-red-50",
    urgent: "border-amber-300 bg-amber-50",
    normal: "border-slate-200 bg-white",
    info: "border-slate-200 bg-white",
  }[task.urgency];

  const deadlineText = (() => {
    if (!task.deadline || task.daysLeft === null) return "";
    if (task.daysLeft < 0) return `Просрочено на ${Math.abs(task.daysLeft)} дн.`;
    if (task.daysLeft === 0) return "Сегодня";
    if (task.daysLeft === 1) return "Завтра";
    return `Через ${task.daysLeft} дн.`;
  })();

  const deadlineColor = {
    overdue: "text-red-700",
    urgent: "text-amber-700",
    normal: "text-slate-500",
    info: "text-slate-400",
  }[task.urgency];

  return (
    <Link
      href={task.url}
      className={`flex items-start gap-3 rounded-2xl border p-4 transition hover:shadow-sm ${urgencyStyles}`}
    >
      <PhotoThumb url={task.photoUrl} size={56} />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-900">{task.action}</div>
        <div className="mt-0.5 text-sm text-slate-700 line-clamp-1">{task.title}</div>
        {task.subtitle && (
          <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">{task.subtitle}</div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 text-right">
        {task.urgency === "overdue" && <span className="text-lg">⚠️</span>}
        {deadlineText && (
          <span className={`text-xs font-medium ${deadlineColor}`}>{deadlineText}</span>
        )}
        <span className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white">
          Открыть →
        </span>
      </div>
    </Link>
  );
}
