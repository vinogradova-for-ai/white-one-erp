"use client";

import Link from "next/link";
import { ROLE_LABELS, PRODUCT_MODEL_STATUS_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { OwnerMonthStats, StageTotals, TeamMonthStats } from "@/lib/queries/team-month-stats";
import type { OwnerProjects } from "@/lib/queries/team-projects";

/**
 * Блок «Команда в месяце».
 *
 * Сводная полоса из 4 этапов (командные итоги) + карточка на человека с
 * нагрузкой, чипами этапов и барами плана (только у PM). Клик по карточке
 * ставит ?owner=<id> — общий фильтр задач. Переключатель месяца и
 * сворачивание — через URL / localStorage.
 *
 * basePath параметризует, на какую страницу ведут ссылки (клик по человеку и
 * переключатель месяца): «/dashboard» (главная) или «/stats» (статистика).
 * По умолчанию — «/dashboard» (историческое поведение).
 *
 * projects (опц.) — «Проекты по людям»: у каждого человека раскрывашка с
 * фасонами в разработке и активными заказами. Ключ — ownerId.
 */

const MONTH_NAMES_RU = [
  "январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре",
];

type StageKey = "ordered" | "checked" | "shipped" | "received";

// Цветные заливки живут ТОЛЬКО в сводной полосе (с явными dark:-вариантами —
// глобальная подмена серых в globals.css цветные классы не трогает, из-за чего
// в тёмной теме чипы то слепили, то тонули). У людей — тихие строки с точкой.
const STAGES: Array<{
  key: StageKey;
  label: string;
  card: string; // мини-карточка сводки (палитра фаз Ганта, обе темы)
  dot: string; // цветная точка в строке человека
}> = [
  {
    key: "ordered",
    label: "Заказано",
    card: "border-blue-200/70 bg-blue-50 text-blue-900 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  {
    key: "checked",
    label: "Проверено",
    card: "border-amber-200/70 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  {
    key: "shipped",
    label: "Отправлено",
    card: "border-violet-200/70 bg-violet-50 text-violet-900 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  {
    key: "received",
    label: "Получено",
    card: "border-emerald-200/70 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
];

// 14800 → «14 800» — числа с разрядами читаются, слипшиеся — нет
function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function ymLabel(yearMonth: number): string {
  const month = (yearMonth % 100) - 1;
  const year = Math.floor(yearMonth / 100);
  return `${MONTH_NAMES_RU[month]} ${year}`;
}

function shiftMonth(yearMonth: number, delta: number): number {
  const year = Math.floor(yearMonth / 100);
  const month = (yearMonth % 100) - 1 + delta;
  const d = new Date(Date.UTC(year, month, 1));
  return d.getUTCFullYear() * 100 + (d.getUTCMonth() + 1);
}

function fmtTotals(t: StageTotals): string {
  return `${fmt(t.models)} фас · ${fmt(t.units)} шт`;
}

export function TeamMonthSection({
  stats,
  selectedOwnerId,
  basePath = "/dashboard",
  projects,
}: {
  stats: TeamMonthStats;
  selectedOwnerId: string | null;
  /** Куда ведут ссылки: «/dashboard» или «/stats». */
  basePath?: string;
  /** Проекты по людям (ownerId → фасоны в разработке + активные заказы). */
  projects?: Record<string, OwnerProjects>;
}) {
  const [collapsed, setCollapsed] = usePersistedState<boolean>("dashboard:teamMonth:v1", false);

  const monthText = ymLabel(stats.yearMonth);
  const prevYm = shiftMonth(stats.yearMonth, -1);
  const nextYm = shiftMonth(stats.yearMonth, 1);

  // Ссылки переключения месяца сохраняют текущий фильтр owner.
  const monthHref = (ym: number) => {
    const params = new URLSearchParams();
    params.set("month", `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, "0")}`);
    if (selectedOwnerId) params.set("owner", selectedOwnerId);
    return `${basePath}?${params.toString()}`;
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="-my-1 flex min-h-[40px] items-center gap-2 py-1 text-left"
          aria-expanded={!collapsed}
        >
          <span
            className={`inline-block text-slate-400 transition-transform ${collapsed ? "" : "rotate-90"}`}
            aria-hidden
          >
            ▸
          </span>
          <h2 className="text-base font-semibold text-slate-900">Команда в {monthText.split(" ")[0]}</h2>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href={monthHref(prevYm)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-base text-slate-600 hover:border-slate-300 active:bg-slate-50"
            aria-label="Предыдущий месяц"
          >
            ‹
          </Link>
          {stats.canGoForward ? (
            <Link
              href={monthHref(nextYm)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-base text-slate-600 hover:border-slate-300 active:bg-slate-50"
              aria-label="Следующий месяц"
            >
              ›
            </Link>
          ) : (
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-100 text-base text-slate-300"
              aria-hidden
            >
              ›
            </span>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-4">
          {/* Сводная полоса — командные итоги по 4 этапам */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STAGES.map((s) => (
              <div key={s.key} className={`rounded-xl border px-3 py-2.5 ${s.card}`}>
                <div className="text-xs font-medium opacity-80">{s.label}</div>
                <div className="mt-0.5 text-sm font-semibold tabular-nums">{fmtTotals(stats.totals[s.key])}</div>
              </div>
            ))}
          </div>

          {/* Карточки людей. §4: людей без движений не размазываем повторами
              «движений не было» по карточкам — одна строка со списком имён. */}
          {stats.owners.length === 0 ? (
            <p className="text-sm text-slate-500">В этом месяце активности по команде нет.</p>
          ) : (
            (() => {
              const isIdle = (o: (typeof stats.owners)[number]) =>
                STAGES.every((s) => o[s.key].models === 0 && o[s.key].units === 0) &&
                o.activeLoad.models === 0 &&
                o.activeLoad.units === 0 &&
                o.devModels === 0 &&
                !o.plan;
              const activeOwners = stats.owners.filter((o) => !isIdle(o));
              const idleOwners = stats.owners.filter(isIdle);
              return (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {activeOwners.map((o) => (
                      <PersonCard
                        key={o.ownerId}
                        owner={o}
                        active={o.ownerId === selectedOwnerId}
                        yearMonth={stats.yearMonth}
                        basePath={basePath}
                        projects={projects?.[o.ownerId]}
                      />
                    ))}
                  </div>
                  {idleOwners.length > 0 && (
                    <p className="text-xs text-slate-400">
                      Движений в этом месяце не было: {idleOwners.map((o) => o.ownerName).join(", ")}
                    </p>
                  )}
                </>
              );
            })()
          )}
        </div>
      )}
    </section>
  );
}

function PersonCard({
  owner,
  active,
  yearMonth,
  basePath,
  projects,
}: {
  owner: OwnerMonthStats;
  active: boolean;
  yearMonth: number;
  basePath: string;
  projects?: OwnerProjects;
}) {
  // Клик ставит ?owner=<id>; повторный клик (когда уже выбран) снимает фильтр.
  const params = new URLSearchParams();
  params.set("month", `${Math.floor(yearMonth / 100)}-${String(yearMonth % 100).padStart(2, "0")}`);
  if (!active) params.set("owner", owner.ownerId);
  const href = `${basePath}?${params.toString()}`;

  const roleLabel = owner.role ? ROLE_LABELS[owner.role] : "";

  // Раскрывашка «Проекты» — только если есть что показать. Живёт ВНЕ ссылки на
  // карточку (иначе вложенные <a> на фасоны/заказы дали бы невалидный HTML).
  const devModels = projects?.devModels ?? [];
  const activeOrders = projects?.activeOrders ?? [];
  const hasProjects = devModels.length > 0 || activeOrders.length > 0;

  return (
    <div
      className={`rounded-xl border bg-white transition ${
        active
          ? "border-blue-400 ring-1 ring-blue-400 dark:ring-blue-400/30"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
    <Link
      href={href}
      scroll={false}
      className="block p-3"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{owner.ownerName}</div>
          {roleLabel && <div className="text-xs text-slate-500">{roleLabel}</div>}
        </div>
        <div className="ml-auto shrink-0 text-right">
          <div className="text-[11px] text-slate-400">в работе сейчас</div>
          <div className="text-xs font-medium text-slate-700 tabular-nums">
            {fmt(owner.activeLoad.models)} фас · {fmt(owner.activeLoad.units)} шт
            {owner.devModels > 0 && (
              <span className="text-slate-400"> · +{owner.devModels} в разработке</span>
            )}
          </div>
        </div>
      </div>

      {/* Этапы человека — тихая строка: только НЕнулевые, с цветной точкой.
          Восемь одинаковых плашек на карточку создавали визуальный шум
          («бардак» по отзыву Алёны) — цветные заливки оставлены сводке. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {STAGES.filter((s) => owner[s.key].models > 0 || owner[s.key].units > 0).map((s) => {
          const t = owner[s.key];
          return (
            <span key={s.key} className="inline-flex items-baseline gap-1.5 text-xs">
              <span className={`inline-block h-2 w-2 self-center rounded-full ${s.dot}`} aria-hidden />
              <span className="text-slate-500">{s.label.toLowerCase()}</span>
              <span className="font-medium text-slate-800 tabular-nums">
                {fmt(t.models)} · {fmt(t.units)}
              </span>
            </span>
          );
        })}
        {STAGES.every((s) => owner[s.key].models === 0 && owner[s.key].units === 0) && (
          <span className="text-xs text-slate-400">в этом месяце движений не было</span>
        )}
      </div>

      {/* Бары плана — только у PM с планом */}
      {owner.plan && (owner.plan.models > 0 || owner.plan.units > 0) && (
        <div className="mt-3 space-y-1.5">
          <PlanBar label="план: фасоны" fact={owner.ordered.models} goal={owner.plan.models} color="bg-blue-500" />
          <PlanBar label="план: штуки" fact={owner.ordered.units} goal={owner.plan.units} color="bg-emerald-500" />
        </div>
      )}
    </Link>

      {/* Проекты по человеку — раскрывашка ВНЕ ссылки карточки. */}
      {hasProjects && <PersonProjects devModels={devModels} activeOrders={activeOrders} />}
    </div>
  );
}

/**
 * Раскрывашка «Проекты: N фасонов · M заказов» для карточки человека.
 * Внутри — два списка со статус-бейджами и ссылками. Пустые группы скрыты.
 */
function PersonProjects({
  devModels,
  activeOrders,
}: {
  devModels: OwnerProjects["devModels"];
  activeOrders: OwnerProjects["activeOrders"];
}) {
  const summary = [
    devModels.length > 0 ? `${devModels.length} ${pluralModels(devModels.length)}` : null,
    activeOrders.length > 0 ? `${activeOrders.length} ${pluralOrders(activeOrders.length)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="group border-t border-slate-100">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium text-slate-600 hover:text-slate-900">
        <span className="text-slate-400 transition-transform group-open:rotate-90" aria-hidden>
          ▸
        </span>
        <span>Проекты: {summary}</span>
      </summary>

      <div className="space-y-3 px-3 pb-3">
        {devModels.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              В разработке
            </div>
            <ul className="space-y-1">
              {devModels.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/models/${m.id}`}
                    className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-xs hover:bg-slate-50"
                  >
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {PRODUCT_MODEL_STATUS_LABELS[m.status]}
                    </span>
                    <span className="flex-1 truncate text-slate-800">{m.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeOrders.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Активные заказы
            </div>
            <ul className="space-y-1">
              {activeOrders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/orders/${o.id}`}
                    className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 text-xs hover:bg-slate-50"
                  >
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-400/10 dark:text-blue-300">
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-800">
                      <span className="text-slate-400">#{o.orderNumber}</span> {o.modelName}
                    </span>
                    {o.units > 0 && (
                      <span className="shrink-0 text-[10px] text-slate-500 tabular-nums">
                        {fmt(o.units)} шт
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

// Склонение «фасон / фасона / фасонов» и «заказ / заказа / заказов».
function pluralModels(n: number): string {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return "фасонов";
  if (m10 === 1) return "фасон";
  if (m10 >= 2 && m10 <= 4) return "фасона";
  return "фасонов";
}

function pluralOrders(n: number): string {
  const m100 = n % 100;
  const m10 = n % 10;
  if (m100 >= 11 && m100 <= 14) return "заказов";
  if (m10 === 1) return "заказ";
  if (m10 >= 2 && m10 <= 4) return "заказа";
  return "заказов";
}

function PlanBar({
  label,
  fact,
  goal,
  color,
}: {
  label: string;
  fact: number;
  goal: number;
  color: string;
}) {
  const pct = goal > 0 ? Math.min(100, Math.round((fact / goal) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-slate-500">
        <span>{label}</span>
        <span className="tabular-nums">
          {fmt(fact)} / {fmt(goal)}
        </span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
