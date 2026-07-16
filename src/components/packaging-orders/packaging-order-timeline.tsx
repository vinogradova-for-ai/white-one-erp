"use client";

import { useCallback, useState } from "react";
import { DELIVERY_DURATION_DAYS } from "@/lib/constants";
import type { DeliveryMethod } from "@prisma/client";
import { PhaseTimeline, type PhaseSpec } from "@/components/timeline/phase-timeline";
import type { FieldChange } from "@/lib/timeline-math";

type Timeline = {
  productionEndDate: string;
  expectedDate: string;
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
function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

function calcDefaults(deliveryMethod?: DeliveryMethod | null): Timeline {
  const today = toISO(new Date());
  const deliveryDays = deliveryMethod ? DELIVERY_DURATION_DAYS[deliveryMethod] : 30;
  const productionEndDate = addDays(today, 30);
  const expectedDate = addDays(productionEndDate, deliveryDays);
  return { productionEndDate, expectedDate };
}

// Тонкая обёртка над PhaseTimeline для 3 фаз упаковки. По факту хранимых полей
// два (productionEndDate, expectedDate); старт Производства — локальный UI-стейт
// (в БД для упаковки нет отдельного поля старта). Поэтому старт Производства
// живёт как виртуальное поле "productionStart" и не уходит в onChange наружу.
const PROD_START_FIELD = "productionStart";

export function PackagingOrderTimeline({
  initial,
  onChange,
  deliveryMethod,
}: {
  initial: Timeline;
  onChange: (t: Timeline) => void;
  deliveryMethod?: DeliveryMethod | null;
}) {
  const hasSavedDates = !!(initial.productionEndDate || initial.expectedDate);
  const [productionStart, setProductionStart] = useState(() => toISO(new Date()));

  const value: Timeline = hasSavedDates ? initial : calcDefaults(deliveryMethod);
  const prodEnd = value.productionEndDate || productionStart;
  const expected = value.expectedDate || productionStart;

  // Фаза 1 — Производство: startField = виртуальный productionStart.
  // Фаза 2 — Доставка: старт = конец Производства.
  const phases: PhaseSpec[] = [
    {
      key: "production", title: "Производство", icon: "🪡", color: "#3b82f6",
      startField: PROD_START_FIELD, endField: "productionEndDate",
      startIso: productionStart, endIso: prodEnd,
    },
    {
      key: "delivery", title: "Доставка", icon: "✈", color: "#10b981",
      endField: "expectedDate",
      startIso: prodEnd, endIso: expected,
    },
  ];

  const handleChange = useCallback((changes: FieldChange[]) => {
    let nextProdEnd = value.productionEndDate || productionStart;
    let nextExpected = value.expectedDate || productionStart;
    let nextStart = productionStart;
    for (const c of changes) {
      if (c.field === PROD_START_FIELD) nextStart = c.newIso;
      else if (c.field === "productionEndDate") nextProdEnd = c.newIso;
      else if (c.field === "expectedDate") nextExpected = c.newIso;
    }
    if (nextStart !== productionStart) setProductionStart(nextStart);
    onChange({ productionEndDate: nextProdEnd, expectedDate: nextExpected });
  }, [value, productionStart, onChange]);

  return (
    <PhaseTimeline
      phases={phases}
      onChange={handleChange}
      legend="Таймлайн заказа упаковки"
    />
  );
}
