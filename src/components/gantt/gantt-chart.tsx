"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { colorHexFromName, isLightColor } from "@/lib/color-map";

export type GanttBar = {
  key: string;
  title: string;
  color: string;       // tailwind bg-* класс
  start: string;       // YYYY-MM-DD
  end: string;         // YYYY-MM-DD
  owner?: string;
  overdue?: boolean;
  done?: boolean;
  // Опционально: для редактирования дедлайнов через drag
  orderId?: string;
  endField?: string;   // имя поля на Order, в которое сохранится новая end-дата
};

export type GanttGroup = "development" | "orders" | "packaging";

export type GanttThumbnail = {
  photoUrl: string | null;
  colorName: string | null;
};

export type GanttRow = {
  group: GanttGroup;
  id: string;
  href: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  owner?: string | null;
  thumbnails?: GanttThumbnail[];
  bars: GanttBar[];
};

const GROUP_LABELS: Record<GanttGroup | "all", string> = {
  all: "Всё",
  development: "Разработка",
  orders: "Заказы",
  packaging: "Упаковка",
};

const RANGE_OPTIONS = [
  { key: "1m", label: "1 мес", daysBack: 7,  daysForward: 30 },
  { key: "3m", label: "3 мес", daysBack: 14, daysForward: 75 },
  { key: "6m", label: "6 мес", daysBack: 30, daysForward: 150 },
  { key: "1y", label: "Год",   daysBack: 60, daysForward: 300 },
];

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

function formatDM(iso: string): string {
  const d = parseISO(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayDiff(aIso: string, bIso: string): number {
  return Math.round((parseISO(bIso).getTime() - parseISO(aIso).getTime()) / 86400000);
}

export function GanttChart({
  rows,
  onBarEndChange,
  pendingChanges,
}: {
  rows: GanttRow[];
  onBarEndChange?: (orderId: string, endField: string, newEnd: string, group: GanttGroup) => void;
  pendingChanges?: Record<string, string>; // ключ: `${orderId}:${endField}` → ISO дата
}) {
  const [rangeKey, setRangeKey] = useState("3m");

  const range = RANGE_OPTIONS.find((r) => r.key === rangeKey) ?? RANGE_OPTIONS[1];

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const chartStart = toISO(addDays(today, -range.daysBack));
  const chartEnd = toISO(addDays(today, range.daysForward));
  const totalDays = Math.max(1, dayDiff(chartStart, chartEnd));

  // Фильтрация только по видимому диапазону дат; остальные фильтры теперь на серверной странице.
  const visibleRows = useMemo(() => {
    return rows.filter((r) =>
      r.bars.some((b) => b.end >= chartStart && b.start <= chartEnd),
    );
  }, [rows, chartStart, chartEnd]);

  // Разбивка по группам для подзаголовков
  const grouped = useMemo(() => {
    const byGroup: Record<GanttGroup, GanttRow[]> = { development: [], orders: [], packaging: [] };
    for (const r of visibleRows) byGroup[r.group].push(r);
    return byGroup;
  }, [visibleRows]);

  // Позиция % в общем диапазоне
  function posPct(iso: string): number {
    const d = dayDiff(chartStart, iso);
    return (d / totalDays) * 100;
  }

  // Вертикальные опорные линии (по неделям)
  const weekMarks = useMemo(() => {
    const marks: Array<{ iso: string; pct: number; label: string; isMonthStart: boolean }> = [];
    const start = parseISO(chartStart);
    const cur = new Date(start);
    // сдвиг до ближайшего понедельника
    const offset = (cur.getUTCDay() + 6) % 7;
    cur.setUTCDate(cur.getUTCDate() - offset);
    while (cur < addDays(parseISO(chartEnd), 1)) {
      const iso = toISO(cur);
      if (iso >= chartStart && iso <= chartEnd) {
        marks.push({
          iso,
          pct: posPct(iso),
          label: formatDM(iso),
          isMonthStart: cur.getUTCDate() <= 7,
        });
      }
      cur.setUTCDate(cur.getUTCDate() + 7);
    }
    return marks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartStart, chartEnd]);

  const todayIso = toISO(today);
  const todayPct = posPct(todayIso);

  return (
    <div className="space-y-3">
      {/* Диапазон (фаза + ответственный теперь фильтруются на серверной странице /gantt) */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                rangeKey === r.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-slate-500">
          {formatDM(chartStart)} — {formatDM(chartEnd)} · {totalDays} дн
        </div>
      </div>

      {/* График — собственный вертикальный скролл, чтобы sticky-шкала
          и заголовки групп прилипали относительно него, а не window. */}
      <div className="max-h-[calc(100vh-220px)] overflow-auto rounded-xl border border-slate-200 bg-white">
        <div className="min-w-[900px]">
          {/* Шкала сверху */}
          <div className="sticky top-0 z-20 grid grid-cols-[260px_1fr] border-b border-slate-200 bg-white">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Работа</div>
            <div className="relative h-8">
              {weekMarks.map((m) => (
                <div
                  key={m.iso}
                  className="absolute top-0 h-full text-[10px] text-slate-400"
                  style={{ left: `${m.pct}%` }}
                >
                  <div className={`h-full border-l ${m.isMonthStart ? "border-slate-400" : "border-slate-200"}`} />
                  <div className={`absolute -translate-x-1/2 pt-1 ${m.isMonthStart ? "font-semibold text-slate-600" : ""}`} style={{ left: 0, top: 0 }}>
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Группы и строки */}
          {(Object.keys(grouped) as GanttGroup[]).map((g) => {
            const list = grouped[g];
            if (list.length === 0) return null;
            return (
              <div key={g}>
                <div className="sticky top-12 z-10 grid grid-cols-[260px_1fr] border-b border-slate-200 bg-slate-50">
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {GROUP_LABELS[g]} ({list.length})
                  </div>
                  <div />
                </div>
                {list.map((r) => (
                  <RowView
                    key={`${g}-${r.id}`}
                    row={r}
                    weekMarks={weekMarks}
                    todayPct={todayPct}
                    posPct={posPct}
                    chartStart={chartStart}
                    chartEnd={chartEnd}
                    onBarEndChange={onBarEndChange}
                    pendingChanges={pendingChanges}
                  />
                ))}
              </div>
            );
          })}

          {visibleRows.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-400">
              В выбранном диапазоне/фильтрах ничего нет.
            </div>
          )}
        </div>
      </div>

      {/* Легенда */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-blue-500 align-middle" />Производство</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-amber-500 align-middle" />ОТК</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-fuchsia-500 align-middle" />Доставка</span>
        <span className="hidden sm:inline">·</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-rose-400 align-middle" />Лекала</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-purple-500 align-middle" />Образец</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-teal-500 align-middle" />Утверждение</span>
        <span className="hidden sm:inline">·</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-emerald-500 align-middle" />Готово</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-red-500 align-middle" />Просрочено</span>
      </div>
    </div>
  );
}

function RowView({
  row,
  weekMarks,
  todayPct,
  posPct,
  chartStart,
  chartEnd,
  onBarEndChange,
  pendingChanges,
}: {
  row: GanttRow;
  weekMarks: Array<{ iso: string; pct: number; isMonthStart: boolean }>;
  todayPct: number;
  posPct: (iso: string) => number;
  chartStart: string;
  chartEnd: string;
  onBarEndChange?: (orderId: string, endField: string, newEnd: string, group: GanttGroup) => void;
  pendingChanges?: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-[260px_1fr] border-b border-slate-100 hover:bg-slate-50">
      <div className="flex items-start gap-2 px-3 py-2">
        {row.thumbnails && row.thumbnails.length > 0 && <ThumbnailStack thumbs={row.thumbnails} />}
        <div className="min-w-0 flex-1">
          <Link href={row.href} className="block text-sm font-medium text-slate-900 hover:text-blue-600 truncate" title={row.title}>
            {row.title}
          </Link>
          <div className="text-[11px] text-slate-500 truncate">
            {row.statusLabel}{row.subtitle ? ` · ${row.subtitle}` : ""}{row.owner ? ` · ${row.owner}` : ""}
          </div>
        </div>
      </div>
      <div
        className="relative h-[46px]"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(148, 163, 184, 0.16) 1px, transparent 1px)`,
          backgroundSize: `${100 / Math.max(1, dayDiff(chartStart, chartEnd))}% 100%`,
        }}
      >
        {/* Сетка недель на фоне */}
        {weekMarks.map((m) => (
          <div
            key={m.iso}
            className={`absolute top-0 h-full border-l ${m.isMonthStart ? "border-slate-200" : "border-slate-100"}`}
            style={{ left: `${m.pct}%` }}
          />
        ))}
        {/* Линия «сегодня» */}
        {todayPct >= 0 && todayPct <= 100 && (
          <div
            className="absolute top-0 z-10 h-full border-l-2 border-red-400"
            style={{ left: `${todayPct}%` }}
          />
        )}
        {/* Полосы */}
        {row.bars.map((b, i) => {
          // Если есть pending-изменение в буфере — отображаем его, не оригинальный end.
          // Ключ включает group, чтобы заказы одежды и упаковки с одинаковыми id (теоретически)
          // не пересекались между собой.
          const pendKey = b.orderId && b.endField ? `${row.group}:${b.orderId}:${b.endField}` : null;
          const effEnd = (pendKey && pendingChanges?.[pendKey]) ? pendingChanges[pendKey] : b.end;
          const dirty = !!(pendKey && pendingChanges?.[pendKey]);
          // Клип к видимому диапазону
          const s = b.start < chartStart ? chartStart : b.start;
          const e = effEnd > chartEnd ? chartEnd : effEnd;
          if (e < chartStart || s > chartEnd) return null;
          const left = posPct(s);
          const width = Math.max(0.3, posPct(e) - left);
          const days = Math.round((parseISO(effEnd).getTime() - parseISO(b.start).getTime()) / 86400000);
          // Цвет фазы фиксирован (производство/ОТК/доставка). Просрочка показывается красным,
          // но "грязное" состояние (несохранённый drag) НЕ меняет цвет — оставляем родной цвет фазы.
          const barColor = b.overdue ? "bg-red-500" : b.color;
          const tooltip = `${b.title} · ${formatDM(b.start)} → ${formatDM(effEnd)} · ${days} дн${b.owner ? ` · ${b.owner}` : ""}${b.overdue ? " · ПРОСРОЧЕНО" : ""}${dirty ? " · ИЗМЕНЕНО" : ""}`;
          // Все фазы одного заказа в одну строку — они идут последовательно по времени.
          const editable = !!(b.orderId && b.endField && onBarEndChange);
          return (
            <DraggableBar
              key={b.key + i}
              left={left}
              width={width}
              top={8}
              barColor={barColor}
              done={b.done}
              tooltip={tooltip}
              editable={editable}
              chartStart={chartStart}
              chartEnd={chartEnd}
              startIso={b.start}
              endIso={effEnd}
              onCommit={(newEndIso) => {
                if (b.orderId && b.endField && onBarEndChange) {
                  // Каскадный сдвиг: при изменении end этой фазы все последующие
                  // фазы того же заказа двигаются на ту же дельту, сохраняя длительности.
                  const oldEndIso = pendingChanges?.[pendKey ?? ""] ?? b.end;
                  const deltaMs = parseISO(newEndIso).getTime() - parseISO(oldEndIso).getTime();
                  const deltaDays = Math.round(deltaMs / 86400000);
                  onBarEndChange(b.orderId, b.endField, newEndIso, row.group);
                  if (deltaDays !== 0) {
                    for (let j = i + 1; j < row.bars.length; j++) {
                      const nb = row.bars[j];
                      if (!nb.orderId || !nb.endField) continue;
                      const nbKey = `${row.group}:${nb.orderId}:${nb.endField}`;
                      const nbCur = pendingChanges?.[nbKey] ?? nb.end;
                      const shifted = toISO(addDays(parseISO(nbCur), deltaDays));
                      onBarEndChange(nb.orderId, nb.endField, shifted, row.group);
                    }
                  }
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function DraggableBar({
  left,
  width,
  top,
  barColor,
  done,
  tooltip,
  editable,
  chartStart,
  chartEnd,
  startIso,
  endIso,
  onCommit,
  onCommitStart,
}: {
  left: number;
  width: number;
  top: number;
  barColor: string;
  done?: boolean;
  tooltip: string;
  editable: boolean;
  chartStart: string;
  chartEnd: string;
  startIso: string;
  endIso: string;
  onCommit: (newEndIso: string) => void;
  onCommitStart?: (newStartIso: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"end" | "start" | null>(null);
  const [hoverIso, setHoverIso] = useState<string | null>(null);
  // Визуальный «флеш» после успешного commit — белый-через-зелёный обвод
  // на ~600мс, чтобы пользователь видел: «всё, дёрнул и сохранил».
  const [flash, setFlash] = useState(false);
  // Drag через дельту от стартовой точки — позволяет тащить дату ЗА пределы
  // видимой шкалы (в прошлое раньше chartStart или в будущее позже chartEnd).
  const dragRef = useRef<{ startX: number; pxPerDay: number; origIso: string } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      const s = dragRef.current;
      if (!s) return;
      const deltaDays = Math.round((e.clientX - s.startX) / s.pxPerDay);
      const iso = toISO(addDays(parseISO(s.origIso), deltaDays));
      // Единственное ограничение — start <= end, иначе фаза вывернется.
      if (dragging === "end") {
        setHoverIso(iso < startIso ? startIso : iso);
      } else {
        setHoverIso(iso > endIso ? endIso : iso);
      }
    }
    function onUp() {
      let committed = false;
      if (hoverIso) {
        if (dragging === "end") { onCommit(hoverIso); committed = true; }
        else if (onCommitStart) { onCommitStart(hoverIso); committed = true; }
      }
      setDragging(null);
      setHoverIso(null);
      dragRef.current = null;
      if (committed) {
        setFlash(true);
        setTimeout(() => setFlash(false), 600);
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, hoverIso, onCommit, onCommitStart, startIso, endIso]);

  function beginDrag(e: React.MouseEvent, mode: "start" | "end") {
    e.preventDefault();
    e.stopPropagation();
    const track = ref.current?.parentElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const totalDays = Math.max(1, dayDiff(chartStart, chartEnd));
    dragRef.current = {
      startX: e.clientX,
      pxPerDay: rect.width / totalDays,
      origIso: mode === "end" ? endIso : startIso,
    };
    setDragging(mode);
  }

  return (
    <div
      ref={ref}
      className={`group absolute h-4 rounded ${barColor} ${done ? "opacity-60" : ""} shadow-sm transition-all duration-300 ${flash ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`}
      style={{ left: `${left}%`, width: `${width}%`, top }}
      title={tooltip}
    >
      <div className="pointer-events-none absolute left-1/2 top-full z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
        {tooltip}
      </div>
      {editable && onCommitStart && (
        <span
          onMouseDown={(e) => beginDrag(e, "start")}
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l bg-slate-900/40 hover:bg-slate-900/70"
          title="Перетащить старт фазы"
        />
      )}
      {editable && (
        <span
          onMouseDown={(e) => beginDrag(e, "end")}
          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r bg-slate-900/40 hover:bg-slate-900/70"
          title="Перетащить дедлайн"
        />
      )}
      {dragging && hoverIso && (
        <div
          className={`pointer-events-none absolute -top-5 whitespace-nowrap rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] text-white shadow ${dragging === "end" ? "right-0" : "left-0"}`}
        >
          {dragging === "end" ? "→" : "←"} {formatDM(hoverIso)}
        </div>
      )}
    </div>
  );
}

function ThumbnailStack({ thumbs }: { thumbs: GanttThumbnail[] }) {
  const visible = thumbs.slice(0, 3);
  const extra = thumbs.length - visible.length;
  return (
    <div className="flex shrink-0 -space-x-2">
      {visible.map((t, i) => (
        <Thumb key={i} thumb={t} z={visible.length - i} />
      ))}
      {extra > 0 && (
        <span
          className="relative z-0 flex h-9 w-9 items-center justify-center rounded-md border-2 border-white bg-slate-100 text-[10px] font-medium text-slate-600"
          title={`Ещё ${extra}`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function Thumb({ thumb, z }: { thumb: GanttThumbnail; z: number }) {
  const colorHex = thumb.colorName ? colorHexFromName(thumb.colorName) : null;
  const isLight = colorHex ? isLightColor(colorHex) : false;
  if (thumb.photoUrl) {
    return (
      <span className="relative shrink-0" style={{ zIndex: z }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb.photoUrl}
          alt={thumb.colorName ?? ""}
          className="h-9 w-9 rounded-md border-2 border-white object-cover shadow-sm"
        />
        {colorHex && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border-2 border-white ${isLight ? "ring-1 ring-slate-300" : ""}`}
            style={{ backgroundColor: colorHex }}
            title={thumb.colorName ?? ""}
          />
        )}
      </span>
    );
  }
  if (colorHex) {
    return (
      <span
        className={`relative shrink-0 h-9 w-9 rounded-md border-2 border-white ${isLight ? "ring-1 ring-slate-300" : ""}`}
        style={{ backgroundColor: colorHex, zIndex: z }}
        title={thumb.colorName ?? ""}
      />
    );
  }
  return (
    <span
      className="relative shrink-0 flex h-9 w-9 items-center justify-center rounded-md border-2 border-white bg-slate-100 text-[10px] text-slate-400"
      style={{ zIndex: z }}
    >
      нет
    </span>
  );
}
