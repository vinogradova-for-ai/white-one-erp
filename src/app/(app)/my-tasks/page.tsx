import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getMyTasks, type MyTask, type TaskUrgency } from "@/lib/queries/my-tasks";
import { PhotoThumb } from "@/components/common/photo-thumb";

/**
 * Главный экран — минималистичный.
 * Один сквозной список задач со всех сотрудников. Сортировка: что горит — наверху.
 * Сверху: 3 цифры (Просрочено / Срочно / Всего) и быстрые действия.
 * Фильтр по категории — компактные чипы.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; urg?: string }>;
}) {
  const sp = await searchParams;
  const filterCat = sp.cat ?? null;
  const filterUrg = sp.urg ?? null;

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true },
  });

  // Собираем задачи всех. У каждой держим имя ответственного.
  const allWithOwner: Array<MyTask & { ownerName: string }> = [];
  for (const u of users) {
    const tasks = await getMyTasks(u.id, u.role);
    for (const t of tasks) allWithOwner.push({ ...t, ownerName: u.name });
  }

  // Дедуп — задачи на админах часто повторяются у разных людей. Берём первое вхождение.
  const seen = new Set<string>();
  const all = allWithOwner.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  const totalOverdue = all.filter((t) => t.urgency === "overdue").length;
  const totalUrgent = all.filter((t) => t.urgency === "urgent").length;

  const filtered = all.filter((t) => {
    if (filterCat && t.category !== filterCat) return false;
    if (filterUrg && t.urgency !== filterUrg) return false;
    return true;
  });

  // Сортировка: overdue → urgent → normal → info, потом по дате
  const urgencyOrder: Record<TaskUrgency, number> = { overdue: 0, urgent: 1, normal: 2, info: 3 };
  filtered.sort((a, b) => {
    if (a.urgency !== b.urgency) return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    const ad = a.deadline?.getTime() ?? Infinity;
    const bd = b.deadline?.getTime() ?? Infinity;
    return ad - bd;
  });

  return (
    <div className="space-y-5">
      {/* Заголовок и быстрые действия */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Главный</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {filtered.length === all.length
              ? `${all.length} задач в работе`
              : `${filtered.length} из ${all.length} задач`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link href="/models/new" className="rounded-full bg-slate-900 px-3.5 py-1.5 font-medium text-white hover:bg-slate-800">+ Фасон</Link>
          <Link href="/orders/new" className="rounded-full bg-slate-900 px-3.5 py-1.5 font-medium text-white hover:bg-slate-800">+ Заказ</Link>
          <Link href="/packaging-orders/new" className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-slate-700 hover:bg-slate-50">+ Упаковка</Link>
        </div>
      </header>

      {/* KPI плитки */}
      <div className="grid grid-cols-3 gap-3">
        <KpiTile label="Просрочено" value={totalOverdue} accent="red" href="/my-tasks?urg=overdue" active={filterUrg === "overdue"} />
        <KpiTile label="Срочно" value={totalUrgent} accent="amber" href="/my-tasks?urg=urgent" active={filterUrg === "urgent"} />
        <KpiTile label="Всего" value={all.length} accent="slate" href="/my-tasks" active={!filterUrg && !filterCat} />
      </div>

      {/* Фильтр по категориям */}
      <div className="flex flex-wrap gap-1.5">
        <CategoryChip cat={null} label="Все" active={!filterCat} urg={filterUrg} />
        {(["production", "discovery", "packing", "shipping", "content", "receiving"] as const).map((c) => {
          const count = all.filter((t) => t.category === c).length;
          if (count === 0) return null;
          return <CategoryChip key={c} cat={c} label={categoryLabel(c)} count={count} active={filterCat === c} urg={filterUrg} />;
        })}
      </div>

      {/* Список задач */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white px-6 py-16 text-center">
          <div className="text-3xl">✓</div>
          <p className="mt-2 text-sm text-slate-500">Ничего не висит</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white">
          <ul className="divide-y divide-slate-100">
            {filtered.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  accent,
  href,
  active,
}: {
  label: string;
  value: number;
  accent: "red" | "amber" | "slate";
  href: string;
  active: boolean;
}) {
  const accentColor = {
    red: "text-red-600",
    amber: "text-amber-600",
    slate: "text-slate-900",
  }[accent];
  return (
    <Link
      href={href}
      className={`block rounded-2xl px-5 py-4 transition ${
        active ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"
      }`}
    >
      <div className={`text-3xl font-semibold tracking-tight ${active ? "text-white" : accentColor}`}>
        {value}
      </div>
      <div className={`mt-0.5 text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
        {label}
      </div>
    </Link>
  );
}

function CategoryChip({
  cat,
  label,
  count,
  active,
  urg,
}: {
  cat: string | null;
  label: string;
  count?: number;
  active: boolean;
  urg: string | null;
}) {
  const params = new URLSearchParams();
  if (cat) params.set("cat", cat);
  if (urg) params.set("urg", urg);
  const href = params.toString() ? `/my-tasks?${params.toString()}` : "/my-tasks";
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-1.5 ${active ? "text-slate-300" : "text-slate-400"}`}>{count}</span>
      )}
    </Link>
  );
}

function TaskRow({ task }: { task: MyTask & { ownerName: string } }) {
  const dotColor = {
    overdue: "bg-red-500",
    urgent: "bg-amber-500",
    normal: "bg-slate-300",
    info: "bg-slate-200",
  }[task.urgency];

  const deadlineText = (() => {
    if (task.daysLeft === null) return null;
    if (task.daysLeft < 0) return `просрочено на ${Math.abs(task.daysLeft)} дн`;
    if (task.daysLeft === 0) return "сегодня";
    if (task.daysLeft === 1) return "завтра";
    return `через ${task.daysLeft} дн`;
  })();

  const deadlineColor = {
    overdue: "text-red-600",
    urgent: "text-amber-600",
    normal: "text-slate-500",
    info: "text-slate-400",
  }[task.urgency];

  return (
    <li>
      <Link
        href={task.url}
        className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50"
      >
        <span className={`block h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
        {task.photoUrl ? (
          <PhotoThumb url={task.photoUrl} size={36} />
        ) : (
          <div className="h-9 w-9 shrink-0 rounded-md bg-slate-100" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-900">{task.action}</div>
          <div className="truncate text-xs text-slate-500">
            {task.title}
            {task.subtitle && <span className="text-slate-400"> · {task.subtitle}</span>}
            <span className="text-slate-400"> · {task.ownerName}</span>
          </div>
        </div>
        {deadlineText && (
          <span className={`shrink-0 text-xs ${deadlineColor}`}>{deadlineText}</span>
        )}
      </Link>
    </li>
  );
}

function categoryLabel(c: string): string {
  switch (c) {
    case "production": return "Производство";
    case "discovery": return "Разработка";
    case "packing": return "Упаковка";
    case "shipping": return "Доставка";
    case "content": return "Съёмка";
    case "receiving": return "Приёмка";
    default: return c;
  }
}
