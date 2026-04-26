"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Timeline = {
  readyAtFactoryDate: string;
  qcDate: string;
  arrivalPlannedDate: string;
  plannedShootDate: string;
  packingDoneDate: string;
  wbShipmentDate: string;
  saleStartDate: string;
};

type PhaseKey = "production" | "qc" | "shipping" | "packing" | "wb" | "sales";

type Phase = {
  key: PhaseKey;
  title: string;
  icon: string;
  color: string;
  // Концы фазы: берём дату из Timeline по этому ключу
  endField: keyof Timeline;
  // Старт фазы: либо production-start (сегодня), либо ключ предыдущей фазы
  startField: "production-start" | keyof Timeline;
};

const PHASES: Phase[] = [
  { key: "production", title: "Производство",   icon: "🪡", color: "#3b82f6", startField: "production-start",   endField: "readyAtFactoryDate" },
  { key: "qc",         title: "ОТК",            icon: "✓",  color: "#f59e0b", startField: "readyAtFactoryDate", endField: "qcDate" },
  { key: "shipping",   title: "Доставка",       icon: "✈",  color: "#6366f1", startField: "qcDate",             endField: "arrivalPlannedDate" },
  { key: "packing",    title: "Упаковка",       icon: "📦", color: "#8b5cf6", startField: "arrivalPlannedDate", endField: "packingDoneDate" },
  { key: "wb",         title: "Поставка на ВБ", icon: "⬆",  color: "#0ea5e9", startField: "packingDoneDate",    endField: "wbShipmentDate" },
  { key: "sales",      title: "Старт продаж",   icon: "🚀", color: "#10b981", startField: "wbShipmentDate",     endField: "saleStartDate" },
];

const AUTO_SHARES: Record<keyof Timeline, number> = {
  readyAtFactoryDate: 0.55,
  qcDate: 0.66,
  arrivalPlannedDate: 0.80,
  plannedShootDate: 0.86,
  packingDoneDate: 0.91,
  wbShipmentDate: 0.96,
  saleStartDate: 1.00,
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

function calcTimeline(launchMonth: string): Timeline {
  const [y, m] = launchMonth.split("-").map(Number);
  const empty: Timeline = {
    readyAtFactoryDate: "", qcDate: "", arrivalPlannedDate: "",
    plannedShootDate: "", packingDoneDate: "", wbShipmentDate: "", saleStartDate: "",
  };
  if (!y || !m) return empty;
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const t1 = new Date(Date.UTC(y, m - 1, 1));
  const totalMs = t1.getTime() - t0.getTime();
  if (totalMs <= 0) return empty;
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
}: {
  launchMonth: string;
  initial: Timeline;
  onChange: (t: Timeline) => void;
}) {
  const [touched, setTouched] = useState(false);
  const [productionStart, setProductionStart] = useState(() => toISO(new Date()));
  const railRef = useRef<HTMLDivElement>(null);
  const [dragInfo, setDragInfo] = useState<{ left: number; label: string } | null>(null);

  useEffect(() => {
    if (touched) return;
    const calc = calcTimeline(launchMonth);
    onChange(calc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchMonth]);

  function resetAuto() {
    setTouched(false);
    onChange(calcTimeline(launchMonth));
  }

  // Диапазон шкалы: от сегодня (или старта производства, если он раньше) до старта продаж
  const todayIsoForChart = toISO(new Date());
  const chartStart = daysBetween(productionStart, todayIsoForChart) > 0 ? productionStart : todayIsoForChart;
  const chartEnd = initial.saleStartDate || addDays(chartStart, 30);
  const totalDays = Math.max(1, daysBetween(chartStart, chartEnd));

  const getStartIso = useCallback((ph: Phase): string => {
    if (ph.startField === "production-start") return productionStart;
    return initial[ph.startField] || productionStart;
  }, [initial, productionStart]);

  const getEndIso = useCallback((ph: Phase): string => {
    return initial[ph.endField] || productionStart;
  }, [initial, productionStart]);

  function posPct(iso: string): number {
    const d = daysBetween(chartStart, iso);
    return Math.max(0, Math.min(100, (d / totalDays) * 100));
  }

  // ───────── Перетаскивание ─────────
  type DragState = {
    phase: Phase;
    mode: "move" | "resize-left" | "resize-right";
    startX: number;
    origStart: string;
    origEnd: string;
    origPrevEnd: string | null;
    origProductionStart: string;
    pxPerDay: number;
  };
  const dragRef = useRef<DragState | null>(null);

  const commitChange = useCallback((next: Timeline) => {
    setTouched(true);
    onChange(next);
  }, [onChange]);

  const onPointerDown = (e: React.PointerEvent, phase: Phase, mode: DragState["mode"]) => {
    if (!railRef.current) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
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
      origProductionStart: productionStart,
      pxPerDay,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const deltaPx = e.clientX - s.startX;
    const deltaDays = Math.round(deltaPx / s.pxPerDay);

    const next: Timeline = { ...initial };
    const idx = PHASES.indexOf(s.phase);

    if (s.mode === "resize-right") {
      if (deltaDays === 0) return;
      // Сдвигаем только конец текущей фазы (и стартует следующую)
      const newEnd = addDays(s.origEnd, deltaDays);
      // не даём залезать раньше старта
      if (daysBetween(s.origStart, newEnd) < 1) return;
      next[s.phase.endField] = newEnd;
      setDragInfo({ left: posPct(newEnd), label: formatDM(newEnd) });
    } else if (s.mode === "resize-left") {
      if (deltaDays === 0) return;
      if (idx === 0) {
        // Первая фаза — двигаем productionStart, продолжительность фазы сохраняем
        const newStart = addDays(s.origProductionStart, deltaDays);
        if (daysBetween(newStart, s.origEnd) < 1) return;
        setProductionStart(newStart);
        setTouched(true);
        setDragInfo({ left: posPct(newStart), label: formatDM(newStart) });
        return;
      }
      // Сдвигаем конец предыдущей фазы (= старт текущей)
      if (!s.origPrevEnd) return;
      const newPrevEnd = addDays(s.origPrevEnd, deltaDays);
      if (daysBetween(newPrevEnd, s.origEnd) < 1) return;
      const prev = PHASES[idx - 1];
      next[prev.endField] = newPrevEnd;
      setDragInfo({ left: posPct(newPrevEnd), label: formatDM(newPrevEnd) });
    } else {
      if (deltaDays === 0) return;
      // Сдвигаем всю фазу целиком — двигаем её конец И конец предыдущей (=старт)
      const newEnd = addDays(s.origEnd, deltaDays);
      next[s.phase.endField] = newEnd;
      if (s.origPrevEnd) {
        const prev = PHASES[idx - 1];
        next[prev.endField] = addDays(s.origPrevEnd, deltaDays);
      } else {
        // Первая фаза — сдвигаем и productionStart тоже
        const newStart = addDays(s.origProductionStart, deltaDays);
        setProductionStart(newStart);
      }
      setDragInfo({ left: posPct(newEnd), label: `${formatDM(addDays(s.origStart, deltaDays))} → ${formatDM(newEnd)}` });
    }
    if (s.mode !== "resize-left" || idx !== 0) commitChange(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    dragRef.current = null;
    setDragInfo(null);
  };

  // ───────── Шкала дат: метки по неделям и по месяцам ─────────
  const ticks = useMemo(() => {
    const weekly: Array<{ iso: string; pct: number; label: string }> = [];
    const monthly: Array<{ iso: string; pct: number; label: string }> = [];
    const start = parseISO(chartStart);
    if (!start) return { weekly, monthly };
    const cur = new Date(start);
    while (cur <= (parseISO(chartEnd) ?? cur)) {
      const iso = toISO(cur);
      const pct = posPct(iso);
      // Недельная метка — каждый понедельник
      if (cur.getUTCDay() === 1) {
        weekly.push({ iso, pct, label: String(cur.getUTCDate()) });
      }
      // Первое число месяца
      if (cur.getUTCDate() === 1) {
        monthly.push({ iso, pct, label: `${MONTH_SHORT[cur.getUTCMonth()]} ${String(cur.getUTCFullYear()).slice(2)}` });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    // Всегда добавим старт и конец
    if (weekly.length === 0 || weekly[0].iso !== chartStart) {
      weekly.unshift({ iso: chartStart, pct: 0, label: String(parseISO(chartStart)!.getUTCDate()) });
    }
    return { weekly, monthly };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartStart, chartEnd, totalDays]);

  const todayIso = toISO(new Date());
  const todayPct = posPct(todayIso);

  const shootWindow = useMemo(() => {
    const from = initial.arrivalPlannedDate;
    const to = initial.packingDoneDate;
    if (!from || !to) return null;
    const left = posPct(from);
    const right = posPct(to);
    return { from, to, left, width: Math.max(0, right - left) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.arrivalPlannedDate, initial.packingDoneDate, chartStart, totalDays]);

  return (
    <fieldset className="space-y-3">
      <div className="flex items-baseline justify-between">
        <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Таймлайн изделия
        </legend>
        {touched && (
          <button type="button" onClick={resetAuto} className="text-xs text-slate-500 underline hover:text-slate-700">
            Вернуть авто-расчёт
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 select-none">
        {/* Ось сверху: месяцы и числа */}
        <div className="relative mb-2 h-10" ref={railRef}>
          {/* месяца */}
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
          {/* числа (недели) */}
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
          {/* нижняя линия оси */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-slate-300" />
        </div>

        {/* Полотно с сеткой и линией «сегодня» */}
        <div
          className="relative"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Плавающий ярлык с текущей датой при перетаскивании */}
          {dragInfo && (
            <div
              className="pointer-events-none absolute -top-7 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald-600 px-2 py-1 text-xs font-bold text-white shadow-lg"
              style={{ left: `${dragInfo.left}%` }}
            >
              {dragInfo.label}
            </div>
          )}
          {/* Вертикальные линии по неделям (фон) */}
          <div className="pointer-events-none absolute inset-0">
            {ticks.weekly.map((w) => (
              <div key={"g" + w.iso} className="absolute top-0 bottom-0 border-l border-slate-200/70" style={{ left: `${w.pct}%` }} />
            ))}
            {ticks.monthly.map((m) => (
              <div key={"gm" + m.iso} className="absolute top-0 bottom-0 border-l border-slate-400/60" style={{ left: `${m.pct}%` }} />
            ))}
          </div>

          {/* «Сегодня» */}
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

          {/* Строки фаз */}
          <div className="space-y-1">
            {PHASES.map((ph) => {
              const startIso = getStartIso(ph);
              const endIso = getEndIso(ph);
              const left = posPct(startIso);
              const width = Math.max(0.5, posPct(endIso) - left);
              const days = daysBetween(startIso, endIso);
              return (
                <div key={ph.key} className="relative h-9">
                  {/* левая подпись-фаза */}
                  <div className="absolute -left-[0px] top-1/2 hidden -translate-y-1/2 pr-2 text-[11px] text-slate-400" />

                  {/* полоса */}
                  <div
                    onPointerDown={(e) => onPointerDown(e, ph, "move")}
                    className="absolute top-1 flex h-7 cursor-grab items-center rounded-md text-white shadow-sm active:cursor-grabbing"
                    style={{ left: `${left}%`, width: `${width}%`, backgroundColor: ph.color }}
                    title={`${ph.title}: ${formatDM(startIso)} → ${formatDM(endIso)} (${days} дн). Тащите, чтобы сдвинуть.`}
                  >
                    {/* ручка слева — теперь и у первой фазы (двигает старт производства) */}
                    <div
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, ph, "resize-left"); }}
                      className="absolute -left-0.5 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md hover:bg-white/30"
                      title={PHASES.indexOf(ph) === 0 ? "Сдвиньте, чтобы изменить старт производства" : "Сдвиньте, чтобы изменить старт фазы"}
                    />

                    {/* текст */}
                    <div className="flex h-full w-full items-center gap-1.5 overflow-hidden px-2 text-[11px] font-medium whitespace-nowrap">
                      <span>{ph.icon}</span>
                      <span>{ph.title}</span>
                      <span className="opacity-80">· {days} дн</span>
                    </div>

                    {/* даты по краям — всегда видны, жирнее */}
                    <div className="pointer-events-none absolute -top-5 left-0 rounded bg-slate-900/90 px-1 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                      {formatDM(startIso)}
                    </div>
                    <div className="pointer-events-none absolute -top-5 right-0 rounded bg-slate-900/90 px-1 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                      {formatDM(endIso)}
                    </div>

                    {/* ручка справа */}
                    <div
                      onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, ph, "resize-right"); }}
                      className="absolute -right-0.5 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md hover:bg-white/30"
                      title="Сдвиньте, чтобы изменить дедлайн"
                    />
                  </div>
                </div>
              );
            })}

            {/* Окно съёмки */}
            {shootWindow && shootWindow.width > 0 && (
              <div className="relative h-8 pt-1">
                <div
                  className="absolute top-1 flex h-7 items-center rounded-md border-2 border-dashed border-pink-500 bg-pink-500/10 px-2 text-[11px] font-medium text-pink-700 whitespace-nowrap overflow-hidden"
                  style={{ left: `${shootWindow.left}%`, width: `${shootWindow.width}%` }}
                  title={`Съёмку можно провести: ${formatDM(shootWindow.from)} → ${formatDM(shootWindow.to)}`}
                >
                  📷 Съёмка: {formatDM(shootWindow.from)} — {formatDM(shootWindow.to)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Тащите полосу целиком, чтобы сдвинуть фазу, или за края — чтобы поменять старт/дедлайн.
        Розовое окно — когда можно впихнуть съёмку (товар уже приехал, но ещё не упакован).
      </p>
    </fieldset>
  );
}
