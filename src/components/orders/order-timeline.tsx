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

// Авто-расчёт фаз через ФИКСИРОВАННЫЕ длительности, а не пропорции.
// Пропорции (15% / 70% / 15%) давали нереалистично длинную Разработку и ОТК
// для длинных циклов и слишком короткие для коротких — мы перестали верить расчёту.
//
// Логика:
//   1. arrivalPlannedDate (прибытие на склад) = 1-е число launchMonth.
//   2. qcDate            = arrival − DELIVERY_DURATION (по способу доставки).
//   3. readyAtFactoryDate = qcDate − AUTO_QC_DAYS.
//   4. handedToFactoryDate = readyAtFactoryDate − Производство (= что осталось до сегодня).
//   5. decisionDate       = handedToFactoryDate − AUTO_PREP_DAYS.
// Если по факту места под Производство не остаётся (Разработка + ОТК + Доставка
// больше всего цикла), просто прижимаем Разработку к сегодня — Алёна вручную поправит.
const AUTO_PREP_DAYS = 14;  // Разработка по умолчанию
const AUTO_QC_DAYS   = 5;   // ОТК по умолчанию

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
  const t0Iso = toISO(t0);
  const arrival = new Date(Date.UTC(y, m - 1, 1));
  const arrivalIso = toISO(arrival);

  // Способ доставки → фикс. количество дней. Без способа — 0.
  const deliveryDays = deliveryMethod ? DELIVERY_DURATION_DAYS[deliveryMethod] : 0;

  // Раскрутка от прибытия назад: arrival → qc → ready → handed → decision.
  const qcIso = addDays(arrivalIso, -deliveryDays);
  const readyIso = addDays(qcIso, -AUTO_QC_DAYS);

  // Производство = что между «передал на фабрику» и «готов на фабрике».
  // Передачу ставим за AUTO_PREP_DAYS до «готов» назад? Нет — Производство
  // должно быть длинным, и Разработка отдельно. Делаем так:
  //   handed = max(t0 + AUTO_PREP_DAYS, ready − 30)  // хотя бы 30 дн на пошив
  //   decision = handed − AUTO_PREP_DAYS = t0 (если запустились сразу)
  const minProductionDays = 30;
  let handedIso = addDays(readyIso, -minProductionDays);
  const tentativeDecisionIso = addDays(handedIso, -AUTO_PREP_DAYS);
  // Если получилось decision раньше сегодня — двигаем всю Разработку к сегодня,
  // чтобы пользователь видел что-то осмысленное, а не «началось 2 недели назад».
  if (daysBetween(t0Iso, tentativeDecisionIso) < 0) {
    // tentativeDecision раньше today → перегон цикла: жмём Разработку к сегодня.
    return {
      decisionDate: t0Iso,
      handedToFactoryDate: addDays(t0Iso, AUTO_PREP_DAYS),
      readyAtFactoryDate: readyIso,
      qcDate: qcIso,
      arrivalPlannedDate: arrivalIso,
    };
  }
  // Иначе ставим всё как раскрутили; Производство получит ≥ 30 дней.
  if (daysBetween(t0Iso, handedIso) > AUTO_PREP_DAYS) {
    // Между сегодня и «передал на фабрику» больше 14 дней — растягиваем
    // Производство, чтобы покрыть всё свободное время. Разработка остаётся 14 дней.
    handedIso = addDays(t0Iso, AUTO_PREP_DAYS);
  }
  return {
    decisionDate: t0Iso,
    handedToFactoryDate: handedIso,
    readyAtFactoryDate: readyIso,
    qcDate: qcIso,
    arrivalPlannedDate: arrivalIso,
  };
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
  const [dragInfo, setDragInfo] = useState<{ leftPx: number; label: string } | null>(null);
  // Зум = «сколько пикселей занимает один день». Большие значения = крупный масштаб,
  // мелкие = можно охватить весь цикл взглядом. auto подбирает под viewport.
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

  // Шкала охватывает ВСЕ start/end всех фаз — иначе фаза, чей край лежит
  // за пределами «номинальной» шкалы, схлопнется posPct'ом в 0%/100%
  // и потеряет реальную пропорцию по дням.
  // daysBetween(a, b) = b − a в днях:
  //   < 0  ⇔ b раньше a (b — раньше) → для min берём b
  //   > 0  ⇔ b позже a              (b — позже) → для max берём b
  const phaseEdges: string[] = [chainStart];
  for (const ph of PHASES) {
    phaseEdges.push(getStartIso(ph));
    phaseEdges.push(getEndIso(ph));
  }
  const earliestPhase = phaseEdges.reduce((a, b) => (daysBetween(a, b) < 0 ? b : a));
  const latestPhase = phaseEdges.reduce((a, b) => (daysBetween(a, b) > 0 ? b : a));

  // chartStart = min(earliestPhase, today) — фаза в прошлом не вылетает за левый край,
  // маркер «сегодня» влезает, если все фазы в будущем.
  const chartStartRaw = daysBetween(earliestPhase, todayIsoForChart) < 0
    ? todayIsoForChart
    : earliestPhase;
  // chartEnd = max(latestPhase, today) с запасом 3 дня справа,
  // чтобы правая ручка не уехала впритык к краю.
  const latestWithToday = daysBetween(latestPhase, todayIsoForChart) > 0
    ? todayIsoForChart
    : latestPhase;
  const chartEndRaw = addDays(latestWithToday || addDays(chartStartRaw, 30), 3);
  const chartStart = chartStartRaw;
  const chartEnd = chartEndRaw;
  const totalDays = Math.max(7, daysBetween(chartStart, chartEnd));

  // Сколько пикселей занимает один день. Это и есть зум — фикс. масштаб времени.
  // 1 нед: 32 px/день (хорошо для коротких циклов), 1 мес: 16, 3 мес: 6.
  // auto = 8 px/день для типового цикла (~90-120 дней влезает в широкий экран).
  const dayWidth = zoom === "1w" ? 32 : zoom === "1m" ? 16 : zoom === "3m" ? 6 : 8;
  const railWidthPx = totalDays * dayWidth;

  // Позиция и ширина плашки — в пикселях. Никаких процентов и clamping'ов:
  // если фаза честно длинная — она и нарисуется длинной, шкала прокрутится.
  function posPx(iso: string): number {
    return daysBetween(chartStart, iso) * dayWidth;
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
    e.preventDefault();
    const prevPhase = PHASES[PHASES.indexOf(phase) - 1];
    dragRef.current = {
      phase,
      mode,
      startX: e.clientX,
      origStart: getStartIso(phase),
      origEnd: getEndIso(phase),
      origPrevEnd: prevPhase ? getEndIso(prevPhase) : null,
      origChainStart: chainStart,
      pxPerDay: dayWidth, // фикс. масштаб — нет зависимости от ширины контейнера
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
        setDragInfo({ leftPx: posPx(newEnd), label: formatDM(newEnd) });
      } else if (s.mode === "resize-left") {
        if (idx === 0) {
          // Drag ◀ ПЕРВОЙ плашки (Разработка) = меняем decisionDate.
          // End разработки (= start Производства) НЕ двигается. Хвост стоит.
          // По факту фиксируем что разработка фактически началась раньше/позже.
          const newStart = addDays(s.origChainStart, deltaDays);
          next.decisionDate = newStart;
          setDragInfo({ leftPx: posPx(newStart), label: formatDM(newStart) });
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
        setDragInfo({ leftPx: posPx(newPrevEnd), label: formatDM(newPrevEnd) });
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
    const weekly: Array<{ iso: string; leftPx: number; label: string }> = [];
    const monthly: Array<{ iso: string; leftPx: number; label: string }> = [];
    const start = parseISO(chartStart);
    if (!start) return { weekly, monthly };
    const cur = new Date(start);
    while (cur <= (parseISO(chartEnd) ?? cur)) {
      const iso = toISO(cur);
      const leftPx = posPx(iso);
      if (cur.getUTCDay() === 1) {
        weekly.push({ iso, leftPx, label: String(cur.getUTCDate()) });
      }
      if (cur.getUTCDate() === 1) {
        monthly.push({ iso, leftPx, label: `${MONTH_SHORT[cur.getUTCMonth()]} ${String(cur.getUTCFullYear()).slice(2)}` });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    if (weekly.length === 0 || weekly[0].iso !== chartStart) {
      weekly.unshift({ iso: chartStart, leftPx: 0, label: String(parseISO(chartStart)!.getUTCDate()) });
    }
    return { weekly, monthly };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartStart, chartEnd, dayWidth]);

  const todayIso = toISO(new Date());
  const todayLeftPx = posPx(todayIso);
  const todayInRange = todayLeftPx >= 0 && todayLeftPx <= railWidthPx;

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

      {/* Контейнер шкалы — горизонтальный скролл при превышении ширины viewport.
          Внутри — рейл фиксированной ширины (totalDays × dayWidth). Все плашки и
          ручки лежат в этом рейле в абсолютных пикселях. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 select-none">
        <div className="overflow-x-auto" ref={railRef}>
          <div style={{ width: railWidthPx, minWidth: "100%" }}>
            {/* Шапка шкалы — месяцы и недели */}
            <div className="relative mb-2 h-10">
              <div className="absolute inset-x-0 top-0 h-4">
                {ticks.monthly.map((m) => (
                  <div
                    key={"m" + m.iso}
                    className="absolute -translate-x-1/2 text-[11px] font-semibold text-slate-700"
                    style={{ left: m.leftPx }}
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
                    style={{ left: w.leftPx }}
                  >
                    {w.label}
                  </div>
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 h-px bg-slate-300" />
            </div>

            {/* Полотно с плашками */}
            <div className="relative">
              {dragInfo && (
                <div
                  className="pointer-events-none absolute -top-7 z-30 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald-600 px-2 py-1 text-xs font-bold text-white shadow-lg"
                  style={{ left: dragInfo.leftPx }}
                >
                  {dragInfo.label}
                </div>
              )}
              {/* Сетка — вертикальные линии по понедельникам и 1-м числам */}
              <div className="pointer-events-none absolute inset-0">
                {ticks.weekly.map((w) => (
                  <div key={"g" + w.iso} className="absolute top-0 bottom-0 border-l border-slate-300/80" style={{ left: w.leftPx }} />
                ))}
                {ticks.monthly.map((m) => (
                  <div key={"gm" + m.iso} className="absolute top-0 bottom-0 border-l border-slate-400/60" style={{ left: m.leftPx }} />
                ))}
              </div>

              {todayInRange && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-10 border-l-2 border-red-400"
                  style={{ left: todayLeftPx }}
                >
                  <div className="absolute -top-2 left-1 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">
                    сегодня
                  </div>
                </div>
              )}

              {/* Phase bars — стиль /gantt-v2: тонкие вертикальные ручки на краях,
                  скрытые до hover. Позиция и ширина — в пикселях. */}
              <div className="space-y-1">
                {PHASES.map((ph) => {
                  const startIso = getStartIso(ph);
                  const endIso = getEndIso(ph);
                  const leftPx = posPx(startIso);
                  const rawWidthPx = posPx(endIso) - leftPx;
                  // min-width 64px — две ручки 24px помещаются с зазором 16px.
                  // Минус 4px — visual gap между соседними плашками.
                  const widthPx = Math.max(64, rawWidthPx) - 4;
                  const days = daysBetween(startIso, endIso);
                  return (
                    <div key={ph.key} className="relative h-9">
                      <div
                        className="group absolute top-2 flex h-6 items-center rounded text-white shadow-sm transition-shadow hover:shadow-md"
                        style={{ left: leftPx, width: widthPx, backgroundColor: ph.color }}
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
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Наведи на фазу → потяни за левый или правый край. Соседние фазы поедут за ней с теми же длительностями.
        Зум — справа сверху; шкала прокручивается, если цикл длинный.
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
