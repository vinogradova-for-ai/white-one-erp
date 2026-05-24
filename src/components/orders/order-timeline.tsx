"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DELIVERY_DURATION_DAYS } from "@/lib/constants";
import type { DeliveryMethod } from "@prisma/client";

type Timeline = {
  decisionDate: string;
  handedToFactoryDate: string;
  readyAtFactoryDate: string;
  qcDate: string;
  arrivalPlannedDate: string;
};

type PhaseKey = "preparation" | "production" | "qc" | "shipping";

type Phase = {
  key: PhaseKey;
  title: string;
  icon: string;
  color: string;
  endField: keyof Timeline;
  // startField: для первой фазы — это поле, которое хранит старт цепочки
  // (decisionDate). Для остальных — endField предыдущей фазы.
  startField: keyof Timeline;
};

// Цвета синхронизированы с /gantt-v2 (см. LegendItem в gantt-v2-chart.tsx):
// Разработка — slate-400, Производство — blue-500, ОТК — amber-500, Доставка — emerald-500.
const PHASES: Phase[] = [
  { key: "preparation", title: "Разработка",   icon: "✎",  color: "#94a3b8", startField: "decisionDate",        endField: "handedToFactoryDate" },
  { key: "production",  title: "Производство", icon: "🪡", color: "#3b82f6", startField: "handedToFactoryDate", endField: "readyAtFactoryDate" },
  { key: "qc",          title: "ОТК",          icon: "✓",  color: "#f59e0b", startField: "readyAtFactoryDate",  endField: "qcDate" },
  { key: "shipping",    title: "Доставка",     icon: "✈",  color: "#10b981", startField: "qcDate",              endField: "arrivalPlannedDate" },
];

const AUTO_SHARES: Record<keyof Timeline, number> = {
  decisionDate:        0.00,
  handedToFactoryDate: 0.15,
  readyAtFactoryDate:  0.85,
  qcDate:              0.95,
  arrivalPlannedDate:  1.00,
};

function parseISO(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDM(iso: string): string {
  const d = parseISO(iso);
  if (!d) return "—";
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

function calcTimeline(launchMonth: string, deliveryMethod?: DeliveryMethod | null): Timeline {
  const [y, m] = launchMonth.split("-").map(Number);
  const empty: Timeline = {
    decisionDate: "", handedToFactoryDate: "", readyAtFactoryDate: "", qcDate: "", arrivalPlannedDate: "",
  };
  if (!y || !m) return empty;
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const t1 = new Date(Date.UTC(y, m - 1, 1));
  const totalMs = t1.getTime() - t0.getTime();
  if (totalMs <= 0) return empty;

  // Если есть способ доставки — фаза доставки берёт ровно столько дней, сколько прописано
  // в DELIVERY_DURATION_DAYS, остальное идёт под Разработку + Производство + ОТК.
  const deliveryDays = deliveryMethod ? DELIVERY_DURATION_DAYS[deliveryMethod] : null;
  if (deliveryDays != null) {
    const arrival = t1;
    const qcDate = new Date(arrival.getTime() - deliveryDays * 86400000);
    const totalPreShipMs = qcDate.getTime() - t0.getTime();
    if (totalPreShipMs <= 0) return empty;
    // Распределение до отгрузки: 15% Разработка, 70% Производство, 15% ОТК.
    const handed = new Date(t0.getTime() + totalPreShipMs * 0.15);
    const ready = new Date(t0.getTime() + totalPreShipMs * 0.85);
    return {
      decisionDate: toISO(t0),
      handedToFactoryDate: toISO(handed),
      readyAtFactoryDate: toISO(ready),
      qcDate: toISO(qcDate),
      arrivalPlannedDate: toISO(arrival),
    };
  }

  const result: Timeline = { ...empty };
  (Object.keys(AUTO_SHARES) as (keyof Timeline)[]).forEach((k) => {
    const d = new Date(t0.getTime() + totalMs * AUTO_SHARES[k]);
    result[k] = toISO(d);
  });
  return result;
}

const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export function OrderTimeline({
  launchMonth,
  initial,
  onChange,
  deliveryMethod,
}: {
  launchMonth: string;
  initial: Timeline;
  onChange: (t: Timeline) => void;
  deliveryMethod?: DeliveryMethod | null;
}) {
  // Если в БД уже сохранены даты — считаем таймлайн "ручным" и НЕ пересчитываем дефолты,
  // иначе при каждом mount авто-рассчёт перетрёт сохранённые значения пользователя.
  const hasSavedDates = !!(
    initial.decisionDate || initial.handedToFactoryDate ||
    initial.readyAtFactoryDate || initial.qcDate || initial.arrivalPlannedDate
  );
  const [touched, setTouched] = useState(hasSavedDates);
  // Старт цепочки = decisionDate из таймлайна. Если decisionDate пуст — берём сегодня.
  const chainStart = initial.decisionDate || toISO(new Date());
  const railRef = useRef<HTMLDivElement>(null);
  const [dragInfo, setDragInfo] = useState<{ left: number; label: string } | null>(null);
  // Зум шкалы: "auto" (по фазам), "1w" / "1m" / "3m" — фиксированные диапазоны.
  const [zoom, setZoom] = useState<"auto" | "1w" | "1m" | "3m">("auto");

  useEffect(() => {
    if (touched) return;
    const calc = calcTimeline(launchMonth, deliveryMethod);
    onChange(calc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchMonth, deliveryMethod]);

  function resetAuto() {
    setTouched(false);
    onChange(calcTimeline(launchMonth, deliveryMethod));
  }

  const todayIsoForChart = toISO(new Date());

  const getStartIso = useCallback((ph: Phase): string => {
    return initial[ph.startField] || chainStart;
  }, [initial, chainStart]);

  const getEndIso = useCallback((ph: Phase): string => {
    return initial[ph.endField] || chainStart;
  }, [initial, chainStart]);

  // Шкала должна охватить ВСЕ start/end всех фаз — иначе фаза, чей старт
  // раньше chainStart (например, после ручной правки или при аномалии вроде
  // отрицательной Разработки), будет срезана posPct'ом и получит ширину,
  // не соответствующую её реальной длительности в днях. Симптом: соседние
  // 7-дневные плашки рисуются с разной шириной.
  const phaseEdges: string[] = [chainStart];
  for (const ph of PHASES) {
    phaseEdges.push(getStartIso(ph));
    phaseEdges.push(getEndIso(ph));
  }
  const earliestPhase = phaseEdges.reduce((a, b) => (daysBetween(a, b) < 0 ? a : b));
  const latestPhase = phaseEdges.reduce((a, b) => (daysBetween(a, b) > 0 ? a : b));

  // chartStart = самая ранняя из дат: фаз или «сегодня» (чтобы маркер «сегодня»
  // влез на шкалу, если все фазы лежат в будущем).
  const chartStartRaw = daysBetween(earliestPhase, todayIsoForChart) < 0
    ? todayIsoForChart
    : earliestPhase;
  const zoomDays = zoom === "1w" ? 7 : zoom === "1m" ? 30 : zoom === "3m" ? 90 : null;
  // chartEnd: при auto — до самой поздней даты фаз, но не раньше «сегодня».
  // Гарантируем минимум 7 дней ширины, чтоб шкала была визуально читаемой.
  let chartEnd: string;
  if (zoomDays != null) {
    chartEnd = addDays(chartStartRaw, zoomDays);
  } else {
    const latestWithToday = daysBetween(latestPhase, todayIsoForChart) > 0
      ? todayIsoForChart
      : latestPhase;
    chartEnd = latestWithToday || addDays(chartStartRaw, 30);
    if (daysBetween(chartStartRaw, chartEnd) < 7) {
      chartEnd = addDays(chartStartRaw, 7);
    }
  }
  const chartStart = chartStartRaw;
  const totalDays = Math.max(1, daysBetween(chartStart, chartEnd));

  function posPct(iso: string): number {
    const d = daysBetween(chartStart, iso);
    return Math.max(0, Math.min(100, (d / totalDays) * 100));
  }

  type DragState = {
    phase: Phase;
    mode: "move" | "resize-left" | "resize-right";
    startX: number;
    origStart: string;
    origEnd: string;
    origPrevEnd: string | null;
    origChainStart: string;
    pxPerDay: number;
  };
  const dragRef = useRef<DragState | null>(null);

  const commitChange = useCallback((next: Timeline) => {
    setTouched(true);
    onChange(next);
  }, [onChange]);

  // Drag через window-слушатели — pointer capture мешал ловить движение
  // когда курсор уходил с handle (был лаг между движением и обновлением).
  const onPointerDown = (e: React.PointerEvent, phase: Phase, mode: DragState["mode"]) => {
    if (!railRef.current) return;
    e.preventDefault();
    const rect = railRef.current.getBoundingClientRect();
    const pxPerDay = rect.width / totalDays;
    const prevPhase = PHASES[PHASES.indexOf(phase) - 1];
    dragRef.current = {
      phase,
      mode,
      startX: e.clientX,
      origStart: getStartIso(phase),
      origEnd: getEndIso(phase),
      origPrevEnd: prevPhase ? getEndIso(prevPhase) : null,
      origChainStart: chainStart,
      pxPerDay,
    };

    // Сохраняем оригинальные end-ы ВСЕХ фаз — чтобы каскад сдвигал
    // их относительно момента начала drag, а не накопительно.
    const origAllEnds: Record<string, string> = {};
    for (const ph of PHASES) origAllEnds[ph.endField] = getEndIso(ph);

    function handleMove(ev: PointerEvent) {
      const s = dragRef.current;
      if (!s) return;
      const deltaPx = ev.clientX - s.startX;
      const deltaDays = Math.round(deltaPx / s.pxPerDay);
      if (deltaDays === 0) return;

      const next: Timeline = { ...initial };
      const idx = PHASES.indexOf(s.phase);

      // Никаких clamp'ов / валидаций — даты должны двигаться куда угодно,
      // в том числе в прошлое. Если пользователь сделает фазу с
      // отрицательной длительностью — увидит сам и поправит.

      if (s.mode === "resize-right") {
        // Drag ▶ фазы N: меняем длительность фазы N (её end двигается).
        // Соседи СПРАВА сдвигаются на ту же дельту — их длительности сохраняются.
        const newEnd = addDays(s.origEnd, deltaDays);
        next[s.phase.endField] = newEnd;
        for (let j = idx + 1; j < PHASES.length; j++) {
          const nextPh = PHASES[j];
          next[nextPh.endField] = addDays(origAllEnds[nextPh.endField], deltaDays);
        }
        setDragInfo({ left: posPct(newEnd), label: formatDM(newEnd) });
      } else if (s.mode === "resize-left") {
        if (idx === 0) {
          // Drag ◀ ПЕРВОЙ плашки (Разработка) = меняем decisionDate.
          // End разработки (= start Производства) НЕ двигается. Хвост стоит.
          // По факту фиксируем что разработка фактически началась раньше/позже.
          const newStart = addDays(s.origChainStart, deltaDays);
          next.decisionDate = newStart;
          setDragInfo({ left: posPct(newStart), label: formatDM(newStart) });
          commitChange(next);
          return;
        }
        // Drag ◀ не первой фазы = drag ▶ предыдущей: меняем длительность
        // предыдущей фазы. Текущая и далее едут на ту же дельту, их
        // длительности сохраняются.
        if (!s.origPrevEnd) return;
        const newPrevEnd = addDays(s.origPrevEnd, deltaDays);
        const prev = PHASES[idx - 1];
        next[prev.endField] = newPrevEnd;
        for (let j = idx; j < PHASES.length; j++) {
          const nextPh = PHASES[j];
          next[nextPh.endField] = addDays(origAllEnds[nextPh.endField], deltaDays);
        }
        setDragInfo({ left: posPct(newPrevEnd), label: formatDM(newPrevEnd) });
      } else {
        return;
      }
      commitChange(next);
    }

    function handleUp() {
      dragRef.current = null;
      setDragInfo(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  const ticks = useMemo(() => {
    const weekly: Array<{ iso: string; pct: number; label: string }> = [];
    const monthly: Array<{ iso: string; pct: number; label: string }> = [];
    const start = parseISO(chartStart);
    if (!start) return { weekly, monthly };
    const cur = new Date(start);
    while (cur <= (parseISO(chartEnd) ?? cur)) {
      const iso = toISO(cur);
      const pct = posPct(iso);
      if (cur.getUTCDay() === 1) {
        weekly.push({ iso, pct, label: String(cur.getUTCDate()) });
      }
      if (cur.getUTCDate() === 1) {
        monthly.push({ iso, pct, label: `${MONTH_SHORT[cur.getUTCMonth()]} ${String(cur.getUTCFullYear()).slice(2)}` });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    if (weekly.length === 0 || weekly[0].iso !== chartStart) {
      weekly.unshift({ iso: chartStart, pct: 0, label: String(parseISO(chartStart)!.getUTCDate()) });
    }
    return { weekly, monthly };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartStart, chartEnd, totalDays]);

  const todayIso = toISO(new Date());
  const todayPct = posPct(todayIso);

  return (
    <fieldset className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Таймлайн изделия
        </legend>
        <div className="flex items-center gap-2">
          <ZoomSwitch zoom={zoom} setZoom={setZoom} />
          {touched && (
            <button type="button" onClick={resetAuto} className="text-xs text-slate-500 underline hover:text-slate-700">
              Вернуть авто-расчёт
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 select-none">
        <div className="relative mb-2 h-10" ref={railRef}>
          <div className="absolute inset-x-0 top-0 h-4">
            {ticks.monthly.map((m) => (
              <div
                key={"m" + m.iso}
                className="absolute -translate-x-1/2 text-[11px] font-semibold text-slate-700"
                style={{ left: `${m.pct}%` }}
              >
                {m.label}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 top-4 h-4">
            {ticks.weekly.map((w) => (
              <div
                key={"w" + w.iso}
                className="absolute -translate-x-1/2 text-[10px] text-slate-400"
                style={{ left: `${w.pct}%` }}
              >
                {w.label}
              </div>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-px bg-slate-300" />
        </div>

        <div className="relative">
          {dragInfo && (
            <div
              className="pointer-events-none absolute -top-7 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald-600 px-2 py-1 text-xs font-bold text-white shadow-lg"
              style={{ left: `${dragInfo.left}%` }}
            >
              {dragInfo.label}
            </div>
          )}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(148, 163, 184, 0.18) 1px, transparent 1px)`,
              backgroundSize: `${100 / totalDays}% 100%`,
            }}
          >
            {ticks.weekly.map((w) => (
              <div key={"g" + w.iso} className="absolute top-0 bottom-0 border-l border-slate-300/80" style={{ left: `${w.pct}%` }} />
            ))}
            {ticks.monthly.map((m) => (
              <div key={"gm" + m.iso} className="absolute top-0 bottom-0 border-l border-slate-400/60" style={{ left: `${m.pct}%` }} />
            ))}
          </div>

          {todayPct > 0 && todayPct < 100 && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 border-l-2 border-red-400"
              style={{ left: `${todayPct}%` }}
            >
              <div className="absolute -top-2 left-1 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
                сегодня
              </div>
            </div>
          )}

          {/* Phase bars — стиль /gantt-v2: тонкие вертикальные ручки 3px на краях,
              скрытые до hover плашки. На hover плашки появляется тултип снизу. */}
          <div className="space-y-1">
            {PHASES.map((ph) => {
              const startIso = getStartIso(ph);
              const endIso = getEndIso(ph);
              const left = posPct(startIso);
              const width = Math.max(0.5, posPct(endIso) - left);
              const days = daysBetween(startIso, endIso);
              return (
                <div key={ph.key} className="relative h-9">
                  <div
                    // min-width 88px — короткая фаза не сжимается в дробинку,
                    // две ручки уверенно тыкаются. -6px — gap между соседями.
                    className="group absolute top-2 flex h-6 items-center rounded text-white shadow-sm transition-shadow hover:shadow-md"
                    style={{ left: `${left}%`, width: `calc(max(${width}%, 88px) - 6px)`, backgroundColor: ph.color }}
                  >
                    <div className="flex h-full w-full items-center gap-1.5 overflow-hidden px-3 text-[11px] font-medium whitespace-nowrap">
                      <span>{ph.icon}</span>
                      <span>{ph.title}</span>
                      <span className="opacity-80">· {days} дн</span>
                    </div>

                    {/* Тултип под плашкой — появляется при hover. */}
                    <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                      {ph.title} · {formatDM(startIso)} → {formatDM(endIso)} · {days} дн
                    </div>

                    {/* Левая ручка — тонкая вертикальная полоска. Hit-area 10px,
                        видимая часть 3px белая. Скрыта до hover. */}
                    <span
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, ph, "resize-left"); }}
                      title={PHASES.indexOf(ph) === 0
                        ? "Потянуть — сдвинуть старт производства (все фазы поедут вместе)"
                        : "Потянуть — изменить начало фазы"}
                      className="absolute left-0 top-0 z-20 h-full w-2.5 -translate-x-1/2 cursor-ew-resize opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100"
                    >
                      <span className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)] transition-all hover:w-[5px] hover:bg-slate-900 hover:shadow-[0_0_0_1px_white]" />
                    </span>

                    {/* Правая ручка. */}
                    <span
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, ph, "resize-right"); }}
                      title="Потянуть — изменить конец фазы"
                      className="absolute right-0 top-0 z-20 h-full w-2.5 translate-x-1/2 cursor-ew-resize opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:!opacity-100"
                    >
                      <span className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)] transition-all hover:w-[5px] hover:bg-slate-900 hover:shadow-[0_0_0_1px_white]" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Наведи на фазу → потяни за левый или правый край. Соседние фазы поедут за ней с теми же длительностями.
      </p>
    </fieldset>
  );
}

function ZoomSwitch({
  zoom,
  setZoom,
}: {
  zoom: "auto" | "1w" | "1m" | "3m";
  setZoom: (z: "auto" | "1w" | "1m" | "3m") => void;
}) {
  const opts: Array<{ k: "auto" | "1w" | "1m" | "3m"; label: string }> = [
    { k: "1w", label: "1 нед" },
    { k: "1m", label: "1 мес" },
    { k: "3m", label: "3 мес" },
    { k: "auto", label: "Авто" },
  ];
  return (
    <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 text-xs">
      {opts.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => setZoom(o.k)}
          className={`rounded-md px-2 py-1 font-medium ${
            zoom === o.k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
