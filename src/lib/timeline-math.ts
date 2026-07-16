// Чистая математика перетаскивания фаз таймлайна — ЕДИНЫЙ источник правды
// для всех трёх движков (форма заказа, форма упаковки, график Ганта).
//
// ЗАКОН АЛЁНЫ (контракт жестов, вшит в проект):
//   ◀ ПЕРВОЙ фазы      → меняем ТОЛЬКО startField первой фазы (хвост стоит).
//   ▶ ЛЮБОЙ фазы N      → меняем endField фазы N; все фазы ПРАВЕЕ едут на ту же
//                          дельту, сохраняя свои длительности.
//   ◀ НЕ первой фазы N  → эквивалент ▶ фазы N−1.
//
// ⚠️ НИКАКИХ клампов, min/max, «подтяжек», safety-net. Дата тянется куда угодно —
// хоть в прошлое, хоть фаза схлопывается в ноль или переворачивается. Алёна сама
// поправит. Старые «умные» подтяжки соседей давали «рандомные» прыжки — их нет.

// Одна фаза таймлайна. startField есть ТОЛЬКО у первой фазы (это поле, хранящее
// старт всей цепочки, напр. decisionDate). Для остальных фаз старт = endField
// предыдущей фазы, поэтому собственного startField у них нет.
export type TimelinePhase = {
  key: string;
  endField: string;
  startField?: string;
  startIso: string;
  endIso: string;
};

export type DragGesture = {
  phaseIndex: number;
  edge: "start" | "end";
  newIso: string;
};

// Одно изменение поля даты. Компонент сам решает, как это записать (pending/БД).
export type FieldChange = {
  field: string;
  newIso: string;
};

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

// Применяет жест к массиву фаз и возвращает список изменений полей (field → newIso).
// БЕЗ клампов и подтяжек. Возвращает [] если жест ничего не меняет (дельта 0)
// или невалиден.
export function applyDrag(phases: TimelinePhase[], gesture: DragGesture): FieldChange[] {
  const { phaseIndex, edge, newIso } = gesture;
  if (phaseIndex < 0 || phaseIndex >= phases.length) return [];
  const phase = phases[phaseIndex];

  // ◀ ПЕРВОЙ фазы = меняем ТОЛЬКО её startField. Хвост (её конец и всё дальше)
  // стоит на месте.
  if (edge === "start" && phaseIndex === 0) {
    if (!phase.startField) return [];
    if (newIso === phase.startIso) return [];
    return [{ field: phase.startField, newIso }];
  }

  // ◀ НЕ первой фазы N = ▶ фазы N−1: пересчитываем как перетаскивание правого
  // края предыдущей фазы к newIso.
  if (edge === "start") {
    return applyDrag(phases, { phaseIndex: phaseIndex - 1, edge: "end", newIso });
  }

  // ▶ фазы N: endField фазы N → newIso; фазы ПРАВЕЕ едут на ту же дельту,
  // сохраняя длительности (их endField сдвигается на delta от исходного).
  const delta = daysBetween(phase.endIso, newIso);
  if (delta === 0) return [];

  const changes: FieldChange[] = [{ field: phase.endField, newIso }];
  for (let j = phaseIndex + 1; j < phases.length; j++) {
    const p = phases[j];
    changes.push({ field: p.endField, newIso: addDays(p.endIso, delta) });
  }
  return changes;
}
