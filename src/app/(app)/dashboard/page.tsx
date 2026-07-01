import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getMainScreenChecklist,
  groupByOwner,
  zoneOf,
  type ChecklistTask,
  type TaskUrgency,
  type TaskZone,
} from "@/lib/queries/main-screen-checklist";
import { CheckableRow } from "./checkable-row";
import { isCheckable } from "./checkable-kinds";
import { getTeamMonthStats } from "@/lib/queries/team-month-stats";
import { TeamMonthSection } from "@/components/dashboard/team-month-section";

/** Парсит ?month=YYYY-MM в число YYYYMM. null — не задан/невалиден. */
function parseMonthParam(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!m) return undefined;
  const ym = Number(m[1]) * 100 + Number(m[2]);
  return Number.isFinite(ym) ? ym : undefined;
}

const MONTH_NAMES_RU = [
  "январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре",
];

async function getMonthClosedCount(ownerId: string | null): Promise<number> {
  // Считаем заказы где arrivalActualDate в текущем месяце по МСК.
  const now = new Date();
  const mskNow = new Date(now.getTime() + 3 * 60 * 60_000);
  const startOfMonth = new Date(Date.UTC(mskNow.getUTCFullYear(), mskNow.getUTCMonth(), 1));
  const startOfNext = new Date(Date.UTC(mskNow.getUTCFullYear(), mskNow.getUTCMonth() + 1, 1));
  return prisma.order.count({
    where: {
      deletedAt: null,
      arrivalActualDate: { gte: startOfMonth, lt: startOfNext },
      ...(ownerId ? { ownerId } : {}),
    },
  });
}

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const userName = session?.user?.name ?? "";
  const myId = (session?.user as { id?: string } | undefined)?.id ?? null;

  const [all, teamStats] = await Promise.all([
    getMainScreenChecklist(),
    getTeamMonthStats(parseMonthParam(sp.month)),
  ]);
  const groups = groupByOwner(all);

  // Кабинет общий — разбивку задач по сотрудникам видят ВСЕ (прозрачность), не только админ.
  // По умолчанию открыта своя подвкладка; если своих задач нет — самая загруженная.
  const visibleGroups = groups;
  const selectedOwnerId =
    sp.owner && visibleGroups.some((g) => g.ownerId === sp.owner)
      ? sp.owner
      : visibleGroups.some((g) => g.ownerId === myId)
        ? myId
        : visibleGroups[0]?.ownerId;
  const selected = visibleGroups.find((g) => g.ownerId === selectedOwnerId);

  // «Закрыто в мае: X заказов» — для админа подвкладки, для остальных — своё.
  // Это позитивный сигнал, прогресс. Считаем по выбранной подвкладке.
  const monthClosed = selectedOwnerId
    ? await getMonthClosedCount(selectedOwnerId)
    : 0;
  const nowMsk = new Date(new Date().getTime() + 3 * 60 * 60_000);
  const monthName = MONTH_NAMES_RU[nowMsk.getUTCMonth()];

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

      <TeamMonthSection stats={teamStats} selectedOwnerId={selectedOwnerId ?? null} />

      {visibleGroups.length > 0 && (
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

      {monthClosed > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-sm text-emerald-900">
          <span className="font-semibold">✓ Закрыто в {monthName}: {monthClosed}</span>
          <span className="text-emerald-700"> {pluralOrders(monthClosed)}</span>
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

function pluralOrders(n: number): string {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return "заказов";
  if (m10 === 1) return "заказ";
  if (m10 >= 2 && m10 <= 4) return "заказа";
  return "заказов";
}

const ORDER_KINDS: ChecklistTask["kind"][] = ["order-qc", "accept-qc", "check-delivery"];
const PACKAGING_KINDS: ChecklistTask["kind"][] = [
  "pkg-design",
  "pkg-sample",
  "pkg-approve",
  "pkg-launch",
  "pkg-check-delivery",
];

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
  const packagingTasks = tasks.filter((t) => PACKAGING_KINDS.includes(t.kind));
  const devTasks = tasks.filter(
    (t) => !ORDER_KINDS.includes(t.kind) && !PACKAGING_KINDS.includes(t.kind),
  );
  const devWithDeadline = devTasks.filter((t) => t.daysToDeadline !== null);
  const devIdle = devTasks.filter((t) => t.daysToDeadline === null);
  // Упаковка тоже делится на «есть дедлайн» (заказы в пути) и «idle» (разработка PackagingItem).
  const packagingWithDeadline = packagingTasks.filter((t) => t.daysToDeadline !== null);
  const packagingIdle = packagingTasks.filter((t) => t.daysToDeadline === null);
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
      {(packagingWithDeadline.length > 0 || (showIdle && packagingIdle.length > 0)) && (
        <Section title="Упаковка" count={packagingTasks.length}>
          <div className="space-y-4">
            {packagingWithDeadline.length > 0 && <TaskList tasks={packagingWithDeadline} />}
            {showIdle && packagingIdle.length > 0 && (
              <div>
                <div className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  Давно не двигалось
                </div>
                <TaskList tasks={packagingIdle} />
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
      {tasks.map((t) => {
        const ageBorder = ageBorderOf(t.ageInDays);
        // Задачи с однозначным «галочным» переходом — CheckableRow с чек-боксом
        // и выбором фактической даты. Остальные (требуют создать сущность или
        // ввести доп.данные) — обычная ссылка в карточку.
        if (isCheckable(t.kind)) {
          return <CheckableRow key={t.id} task={t} ageBorder={ageBorder} />;
        }
        return <ChecklistRow key={t.id} task={t} ageBorder={ageBorder} />;
      })}
    </ul>
  );
}

function ageBorderOf(age: number | null): string {
  // Цвет рамки для задач разработки — старение по возрасту фасона:
  //   0-7 дн   — без рамки (нейтрально)
  //   8-21 дн  — жёлтая (внимание)
  //   22-44 дн — оранжевая (долг)
  //   45+ дн   — красная (длительный простой)
  if (age === null) return "";
  if (age >= 45) return "border-l-4 border-l-red-400";
  if (age >= 22) return "border-l-4 border-l-orange-400";
  if (age >= 8) return "border-l-4 border-l-amber-300";
  return "";
}

function ChecklistRow({ task, ageBorder }: { task: ChecklistTask; ageBorder: string }) {
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
