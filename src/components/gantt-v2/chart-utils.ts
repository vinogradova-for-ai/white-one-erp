import type { GanttZoom, GanttDensity } from "./types";

export const ZOOM_OPTIONS: Record<GanttZoom, { pxPerDay: number }> = {
  // pxPerDay задаёт «насколько широко рисуется один день». Полная ширина
  // контента = totalDays × pxPerDay. Если она больше viewport — появляется
  // горизонтальный скролл.
  // Границы шкалы рассчитываются календарно: 1w = пн-вс текущей недели,
  // 1m = весь календарный месяц, 3m = текущий месяц + 2 следующих, и т.д.
  "1w":   { pxPerDay: 120 },
  "1m":   { pxPerDay: 35  },
  "3m":   { pxPerDay: 22  },
  "6m":   { pxPerDay: 14  },
  "1y":   { pxPerDay: 8   },
  "auto": { pxPerDay: 22  },
};

// Возвращает start (старт текущего периода — пн или 1-е число), а end — это
// конец таймлайна с большим запасом вперёд, чтобы скролл вправо никогда
// не «упирался». Зум определяет масштаб (pxPerDay) и стартовую точку,
// но не ограничивает будущее.
export function calendarRangeForZoom(zoom: GanttZoom, today: Date): { start: Date; end: Date } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  if (zoom === "1w") {
    const dayIdx = (today.getUTCDay() + 6) % 7;
    const start = new Date(Date.UTC(y, m, today.getUTCDate() - dayIdx));
    // Запас на 12 недель вперёд от понедельника
    const end = new Date(Date.UTC(y, m, start.getUTCDate() + 12 * 7));
    return { start, end };
  }
  if (zoom === "1m") {
    return {
      start: new Date(Date.UTC(y, m, 1)),
      // Запас на 6 месяцев вперёд
      end: new Date(Date.UTC(y, m + 6, 1)),
    };
  }
  if (zoom === "3m") {
    return {
      start: new Date(Date.UTC(y, m, 1)),
      // Запас на 9 месяцев вперёд (видно текущие 3 + ещё 6 при скролле)
      end: new Date(Date.UTC(y, m + 9, 1)),
    };
  }
  if (zoom === "6m") {
    return {
      start: new Date(Date.UTC(y, m, 1)),
      // Запас на 18 месяцев
      end: new Date(Date.UTC(y, m + 18, 1)),
    };
  }
  if (zoom === "1y") {
    return {
      start: new Date(Date.UTC(y, 0, 1)),
      // Запас на 2 года
      end: new Date(Date.UTC(y + 2, 0, 1)),
    };
  }
  // auto
  return {
    start: new Date(Date.UTC(y, m, 1)),
    end: new Date(Date.UTC(y, m + 9, 1)),
  };
}

export const DENSITY: Record<GanttDensity, { rowH: number; thumbSize: number; barH: number; barTop: number; showSubtitle: boolean }> = {
  compact:  { rowH: 32, thumbSize: 0,  barH: 16, barTop: 8,  showSubtitle: false },
  normal:   { rowH: 52, thumbSize: 36, barH: 24, barTop: 14, showSubtitle: true },
  spacious: { rowH: 72, thumbSize: 48, barH: 28, barTop: 22, showSubtitle: true },
};

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

export function formatDM(iso: string): string {
  const d = parseISO(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function dayDiff(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export const MONTH_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
// JS getUTCDay: Вс=0, Пн=1, ..., Сб=6.
export const DAYS_RU = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export function fmtDM(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

export function pluralDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return "дн";
  if (last === 1) return "дн";
  if (last >= 2 && last <= 4) return "дн";
  return "дн";
}

// На мобильном баре подпись каждой фазы должна быть короткой — иначе при
// 4 сегментах на 390px подпись не помещается даже у длинных фаз. 3-4 буквы
// читаются и совпадают с легендой десктопа.
export function phaseShortLabel(title: string): string {
  const t = title.toLowerCase();
  if (t.startsWith("разработ")) return "РАЗР";
  if (t.startsWith("производ")) return "ПРОИЗ";
  if (t.startsWith("отк")) return "ОТК";
  if (t.startsWith("достав")) return "ДОСТ";
  if (t.startsWith("упаков")) return "УПАК";
  if (t.startsWith("заказ")) return "ЗАК";
  // фолбэк — первые 4 буквы заглавными
  return title.slice(0, 4).toUpperCase();
}
