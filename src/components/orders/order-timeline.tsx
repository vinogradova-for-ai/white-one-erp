"use client";

import { useCallback, useEffect, useState } from "react";
import { DELIVERY_DURATION_DAYS } from "@/lib/constants";
import type { DeliveryMethod } from "@prisma/client";
import { PhaseTimeline, type PhaseSpec } from "@/components/timeline/phase-timeline";
import type { FieldChange } from "@/lib/timeline-math";

type Timeline = {
  decisionDate: string;
  handedToFactoryDate: string;
  readyAtFactoryDate: string;
  qcDate: string;
  arrivalPlannedDate: string;
};

// Описание 4 фаз заказа: какое поле хранит конец каждой фазы, старт первой.
// Цвета синхронизированы с /gantt-v2 (LegendItem): Разработка — slate-400,
// Производство — blue-500, ОТК — amber-500, Доставка — emerald-500.
const PHASE_DEFS: Array<{
  key: string; title: string; icon: string; color: string;
  endField: keyof Timeline; startField?: keyof Timeline;
}> = [
  { key: "preparation", title: "Разработка",   icon: "✎",  color: "#94a3b8", startField: "decisionDate",        endField: "handedToFactoryDate" },
  { key: "production",  title: "Производство", icon: "🪡", color: "#3b82f6", endField: "readyAtFactoryDate" },
  { key: "qc",          title: "ОТК",          icon: "✓",  color: "#f59e0b", endField: "qcDate" },
  { key: "shipping",    title: "Доставка",     icon: "✈",  color: "#10b981", endField: "arrivalPlannedDate" },
];

const AUTO_PREP_DAYS = 14;
const AUTO_QC_DAYS = 5;

function parseISO(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
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

// Авто-расчёт таймлайна фикс. длительностями (не пропорциями). Логика та же,
// что была: раскрутка от прибытия (1-е число launchMonth) назад.
// devStartIso — старт разработки фасона: плашка «Разработка» заказа наследует
// его (фасон в работе уже N дней), а не стартует заново с сегодня.
function calcTimeline(launchMonth: string, deliveryMethod?: DeliveryMethod | null, devStartIso?: string): Timeline {
  const [y, m] = launchMonth.split("-").map(Number);
  const empty: Timeline = {
    decisionDate: "", handedToFactoryDate: "", readyAtFactoryDate: "", qcDate: "", arrivalPlannedDate: "",
  };
  if (!y || !m) return empty;
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  const t0Iso = toISO(t0);
  // «Разработка» начинается со старта разработки фасона, если он в прошлом.
  const decisionIso = devStartIso && devStartIso < t0Iso ? devStartIso : t0Iso;
  const arrivalIso = toISO(new Date(Date.UTC(y, m - 1, 1)));
  const deliveryDays = deliveryMethod ? DELIVERY_DURATION_DAYS[deliveryMethod] : 0;
  const qcIso = addDays(arrivalIso, -deliveryDays);
  const readyIso = addDays(qcIso, -AUTO_QC_DAYS);
  const minProductionDays = 30;
  let handedIso = addDays(readyIso, -minProductionDays);
  const tentativeDecisionIso = addDays(handedIso, -AUTO_PREP_DAYS);
  if (daysBetween(t0Iso, tentativeDecisionIso) < 0) {
    return {
      decisionDate: decisionIso,
      handedToFactoryDate: addDays(t0Iso, AUTO_PREP_DAYS),
      readyAtFactoryDate: readyIso,
      qcDate: qcIso,
      arrivalPlannedDate: arrivalIso,
    };
  }
  if (daysBetween(t0Iso, handedIso) > AUTO_PREP_DAYS) {
    handedIso = addDays(t0Iso, AUTO_PREP_DAYS);
  }
  return {
    decisionDate: decisionIso,
    handedToFactoryDate: handedIso,
    readyAtFactoryDate: readyIso,
    qcDate: qcIso,
    arrivalPlannedDate: arrivalIso,
  };
}

// Тонкая обёртка над PhaseTimeline: маппит поля заказа в фазы и обратно.
export function OrderTimeline({
  launchMonth,
  initial,
  onChange,
  deliveryMethod,
  devStartIso,
}: {
  launchMonth: string;
  initial: Timeline;
  onChange: (t: Timeline) => void;
  deliveryMethod?: DeliveryMethod | null;
  devStartIso?: string;
}) {
  const hasSavedDates = !!(
    initial.decisionDate || initial.handedToFactoryDate ||
    initial.readyAtFactoryDate || initial.qcDate || initial.arrivalPlannedDate
  );
  const [touched, setTouched] = useState(hasSavedDates);

  useEffect(() => {
    if (touched) return;
    onChange(calcTimeline(launchMonth, deliveryMethod, devStartIso));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchMonth, deliveryMethod, devStartIso]);

  function resetAuto() {
    setTouched(false);
    onChange(calcTimeline(launchMonth, deliveryMethod, devStartIso));
  }

  // Старт цепочки = decisionDate. Пусто — сегодня.
  const chainStart = initial.decisionDate || toISO(new Date());
  const getField = (f: keyof Timeline): string => initial[f] || chainStart;

  // Собираем фазы: start первой = decisionDate, start остальных = end предыдущей.
  const phases: PhaseSpec[] = PHASE_DEFS.map((def, idx) => {
    const endIso = getField(def.endField);
    const startIso = idx === 0
      ? getField(def.startField!)
      : getField(PHASE_DEFS[idx - 1].endField);
    return {
      key: def.key,
      title: def.title,
      icon: def.icon,
      color: def.color,
      endField: def.endField,
      startField: def.startField,
      startIso,
      endIso,
    };
  });

  const handleChange = useCallback((changes: FieldChange[]) => {
    setTouched(true);
    const next: Timeline = { ...initial };
    for (const c of changes) {
      next[c.field as keyof Timeline] = c.newIso;
    }
    onChange(next);
  }, [initial, onChange]);

  return (
    <PhaseTimeline
      phases={phases}
      onChange={handleChange}
      legend="Таймлайн изделия"
      extraControls={
        touched ? (
          <button type="button" onClick={resetAuto} className="text-xs text-slate-500 underline hover:text-slate-700">
            Вернуть авто-расчёт
          </button>
        ) : null
      }
    />
  );
}
