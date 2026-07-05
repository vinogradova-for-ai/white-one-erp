"use client";

import Link from "next/link";
import type { GanttRowV2 } from "./types";
import type { GanttGroupView } from "./gantt-v2-chart";
import { dayDiff, fmtDM, pluralDays, phaseShortLabel } from "./chart-utils";

// ============================================================
// Мобильный список — нативный Гант для телефона
// ============================================================
// Десктопный Гант («чем заказ N занимается с 04.05 по 25.05») на 390px умирает:
// фазы сжимаются до 1-2px, временная ось теряет смысл. Поэтому на мобиле
// меняем смысл — показываем не «когда», а «где сейчас» каждый заказ.
//
// Карточка заказа:
//   1. Шапка: фото 44×44, название, цвета.
//   2. Фазовый бар — собственная шкала заказа (пропорции фаз ВНУТРИ заказа,
//      не глобальной шкалы). Любая фаза всегда видна, даже короткий ОТК.
//   3. Статус-строка: «🔥 ОТК просрочен на 3 дн» / «► Доставка · до 28.05 (1 дн)» /
//      «✓ Готово 25.04» — главный сигнал, читается мгновенно.
//   4. По тапу — <details> с полным списком фаз и кнопкой открыть заказ.
export function MobileList({ groups, todayIso }: { groups: GanttGroupView[]; todayIso: string }) {
  const all = groups.flatMap((g) => g.rows);
  if (all.length === 0) {
    return <div className="p-6 text-center text-sm text-slate-400">Под фильтры ничего не подошло</div>;
  }
  return (
    <div className="space-y-2">
      {all.map((r) => (
        <MobilePhaseCard key={`${r.group}-${r.id}`} row={r} todayIso={todayIso} />
      ))}
    </div>
  );
}

export function MobilePhaseCard({ row, todayIso }: { row: GanttRowV2; todayIso: string }) {
  if (row.bars.length === 0) {
    return (
      <Link href={row.href} className="block min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-3 active:bg-slate-50">
        <div className="text-sm font-medium text-slate-900">{row.title}</div>
        <div className="text-[11px] text-slate-400">Нет фаз</div>
      </Link>
    );
  }

  const photoUrl = row.thumbnails?.find((t) => t.photoUrl)?.photoUrl ?? null;
  const rowStart = row.bars[0].start;
  const rowEnd = row.bars[row.bars.length - 1].end;

  // Сегменты бара — длительность фазы в днях. Минимум 1, чтобы 0-дневная фаза
  // (старт=конец, бывает у быстрых ОТК) всё равно занимала видимую долю.
  const segments = row.bars.map((b) => ({
    bar: b,
    days: Math.max(1, dayDiff(b.start, b.end)),
  }));
  const totalSegDays = segments.reduce((a, s) => a + s.days, 0);

  // «Сегодня» — позиция внутри окна [rowStart..rowEnd] по реальным дням
  // (не по выровненным сегментам, иначе маркер скачет).
  const totalRealDays = Math.max(1, dayDiff(rowStart, rowEnd));
  const daysFromStart = dayDiff(rowStart, todayIso);
  const todayPctReal = (daysFromStart / totalRealDays) * 100;
  const showToday = todayPctReal >= 0 && todayPctReal <= 100;

  // Активная фаза — приоритет: overdue → active → первая future → последняя done
  const overdueBar = row.bars.find((b) => b.overdue);
  const activeBar = row.bars.find((b) => b.state === "active");
  const firstFuture = row.bars.find((b) => b.state === "future");
  const lastDone = [...row.bars].reverse().find((b) => b.state === "done");
  const allDone = row.bars.every((b) => b.state === "done");

  // Статус-строка: главный сигнал карточки. Один из:
  //   - 🔥 ПРОСРОЧЕНО (красный)
  //   - ► Активная фаза + дней до её конца (амбер если nearly due, иначе обычный)
  //   - Старт следующей фазы (если все done в прошлом, но есть future)
  //   - ✓ Готово (всё done)
  let statusEl: React.ReactNode;
  if (overdueBar) {
    // lagDays: активная фаза дотянута до «сегодня» (Гант показывает факт),
    // её конец = today и dayDiff даст 0 — размер просрочки лежит в lagDays.
    const daysOver = overdueBar.lagDays ?? dayDiff(overdueBar.end, todayIso);
    statusEl = (
      <span className="font-semibold text-red-600 dark:text-red-300">
        🔥 {overdueBar.title} просрочено на {daysOver} {pluralDays(daysOver)}
      </span>
    );
  } else if (activeBar) {
    const daysLeft = dayDiff(todayIso, activeBar.end);
    const urgent = activeBar.nearlyDue;
    statusEl = (
      <span className={urgent ? "font-semibold text-amber-600 dark:text-amber-300" : "text-slate-700"}>
        <span className="font-semibold">► {activeBar.title}</span>
        <span className="text-slate-500"> · до {fmtDM(activeBar.end)}</span>
        <span className={`ml-1 ${urgent ? "text-amber-600 dark:text-amber-300" : "text-slate-500"}`}>
          ({daysLeft >= 0 ? `${daysLeft} ${pluralDays(daysLeft)}` : `опоздание ${-daysLeft} ${pluralDays(-daysLeft)}`})
        </span>
      </span>
    );
  } else if (firstFuture) {
    statusEl = (
      <span className="text-slate-600">
        Старт «{firstFuture.title}» {fmtDM(firstFuture.start)}
      </span>
    );
  } else if (allDone && lastDone) {
    statusEl = (
      <span className="font-medium text-emerald-600 dark:text-emerald-300">
        ✓ Готово {fmtDM(lastDone.end)}
      </span>
    );
  } else {
    statusEl = <span className="text-slate-500">{row.statusLabel}</span>;
  }

  return (
    <details className="group rounded-xl border border-slate-200 bg-white open:border-slate-300 open:shadow-sm">
      <summary className="list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start gap-2.5">
          {photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={photoUrl} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="h-11 w-11 shrink-0 rounded-md bg-slate-100" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{row.title}</div>
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            {row.subtitle && (
              <div className="truncate text-[11px] text-slate-500">{row.subtitle}</div>
            )}
          </div>
        </div>

        {/* Фазовый бар — собственная шкала заказа */}
        <div className="relative mt-3">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            {segments.map(({ bar, days }) => {
              const widthPct = (days / totalSegDays) * 100;
              const cls = bar.overdue ? "bg-red-500" : bar.color;
              const opacity =
                bar.state === "done" ? "opacity-40" : bar.state === "future" ? "opacity-20" : "";
              return (
                <div
                  key={bar.key}
                  className={`${cls} ${opacity}`}
                  style={{ width: `${widthPct}%` }}
                />
              );
            })}
          </div>
          {showToday && (
            <div
              className="absolute -top-0.5 -bottom-0.5 z-10 w-0.5 rounded-full bg-slate-900"
              style={{ left: `${todayPctReal}%` }}
              aria-label="Сегодня"
            />
          )}
        </div>

        {/* Подписи фаз — короткие, под сегментами. Активная фаза жирная.
            У слишком узких сегментов (<10% ширины) подпись прячем, иначе
            соседние сокращения наезжают друг на друга («ПРОИЗ О...»). */}
        <div className="mt-1 flex text-[11px] uppercase tracking-tight text-slate-400">
          {segments.map(({ bar, days }) => {
            const widthPct = (days / totalSegDays) * 100;
            const isActive = bar.state === "active";
            const isOverdue = bar.overdue;
            const showLabel = widthPct >= 10;
            return (
              <div
                key={bar.key}
                className={`truncate text-center ${
                  isOverdue ? "font-semibold text-red-600 dark:text-red-300" : isActive ? "font-semibold text-slate-900" : ""
                }`}
                style={{ width: `${widthPct}%` }}
              >
                {showLabel ? phaseShortLabel(bar.title) : ""}
              </div>
            );
          })}
        </div>

        {/* Статус-строка — главный сигнал */}
        <div className="mt-2 text-[12px] leading-tight">{statusEl}</div>
      </summary>

      {/* Раскрытый блок — детальные фазы */}
      <div className="border-t border-slate-100 px-4 pb-3 pt-2.5">
        <div className="space-y-1.5">
          {row.bars.map((b) => {
            const days = dayDiff(b.start, b.end);
            const isDone = b.state === "done";
            const isActive = b.state === "active";
            const dotCls = b.overdue
              ? "bg-red-500"
              : isDone
                ? `${b.color} opacity-40`
                : isActive
                  ? b.color
                  : `${b.color} opacity-25`;
            return (
              <div key={b.key} className="flex items-center gap-2 text-[12px]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotCls}`} />
                <span
                  className={`flex-1 truncate ${
                    b.overdue
                      ? "font-semibold text-red-600 dark:text-red-300"
                      : isActive
                        ? "font-semibold text-slate-900"
                        : isDone
                          ? "text-slate-500"
                          : "text-slate-700"
                  }`}
                >
                  {b.title}
                </span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {fmtDM(b.start)} → {fmtDM(b.end)}
                </span>
                <span className="w-9 shrink-0 text-right tabular-nums text-slate-400">{days}д</span>
              </div>
            );
          })}
        </div>
        <Link
          href={row.href}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-medium text-white active:bg-slate-700"
        >
          Открыть карточку →
        </Link>
      </div>
    </details>
  );
}
