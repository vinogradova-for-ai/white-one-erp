"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type BoardCard = {
  id: string;
  name: string;
  brandLabel: string;
  category: string;
  photo: string | null;
  statusLabel: string;
  statusDot: string;
  colorChips: Array<{ name: string; hex: string }>;
  /** Сохранённые координаты на доске. null = ещё не размещалась. */
  x: number | null;
  y: number | null;
};

// Геометрия карточки (мировые координаты, до зума).
const CARD_W = 188;
const CARD_H = 250; // приблизительная полная высота (фото + текст) — для fit/раскладки
// Раскладка сеткой
const COLS = 10;
const CELL_W = 210;
const CELL_H = 300;
const PAD = 48;
const MIN_SCALE = 0.12;
const MAX_SCALE = 3;

type Pos = { x: number; y: number };
type View = { scale: number; tx: number; ty: number };

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function gridPos(i: number, startY = PAD): Pos {
  return { x: PAD + (i % COLS) * CELL_W, y: startY + Math.floor(i / COLS) * CELL_H };
}

export function BoardCanvas({ cards }: { cards: BoardCard[] }) {
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement>(null);

  // Начальные позиции: сохранённые берём из БД, не размещённые — раскладываем
  // сеткой ниже уже расставленных.
  const initialPositions = useMemo<Record<string, Pos>>(() => {
    const pos: Record<string, Pos> = {};
    const unplaced: BoardCard[] = [];
    let maxY = 0;
    for (const c of cards) {
      if (c.x != null && c.y != null) {
        pos[c.id] = { x: c.x, y: c.y };
        maxY = Math.max(maxY, c.y);
      } else {
        unplaced.push(c);
      }
    }
    const startY = Object.keys(pos).length ? maxY + CELL_H : PAD;
    unplaced.forEach((c, i) => {
      pos[c.id] = gridPos(i, startY);
    });
    return pos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [positions, setPositions] = useState<Record<string, Pos>>(initialPositions);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  // ── Вписать всё в экран ───────────────────────────────────────────
  const fitTo = useCallback((pos: Record<string, Pos>) => {
    const el = viewportRef.current;
    const ids = Object.keys(pos);
    if (!el || ids.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const p = pos[id];
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + CARD_W);
      maxY = Math.max(maxY, p.y + CARD_H);
    }
    const rect = el.getBoundingClientRect();
    const pad = 60;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const scale = clamp(Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h), MIN_SCALE, 1.1);
    const tx = (rect.width - w * scale) / 2 - minX * scale;
    const ty = (rect.height - h * scale) / 2 - minY * scale;
    setView({ scale, tx, ty });
  }, []);

  // Вписать при первом рендере.
  useEffect(() => {
    fitTo(positionsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Зум колесом (нативный listener — нужен preventDefault) ─────────
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const newScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = newScale / v.scale;
      setView({
        scale: newScale,
        tx: mx - (mx - v.tx) * k,
        ty: my - (my - v.ty) * k,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Панорама (drag по пустому фону) ───────────────────────────────
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const onBgPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    panRef.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBgPointerMove = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (!p) return;
    setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
  };
  const onBgPointerUp = (e: React.PointerEvent) => {
    panRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // ── Перетаскивание карточки ───────────────────────────────────────
  const dragRef = useRef<{
    id: string;
    px: number;
    py: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);

  const onCardPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // не запускаем панораму фона
    const start = positionsRef.current[id];
    dragRef.current = { id, px: e.clientX, py: e.clientY, ox: start.x, oy: start.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onCardPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dxs = e.clientX - d.px;
    const dys = e.clientY - d.py;
    if (!d.moved && Math.abs(dxs) + Math.abs(dys) > 4) d.moved = true;
    if (!d.moved) return;
    const s = viewRef.current.scale;
    setPositions((p) => ({ ...p, [d.id]: { x: d.ox + dxs / s, y: d.oy + dys / s } }));
  };
  const onCardPointerUp = (e: React.PointerEvent, id: string, href: string) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (!d) return;
    if (!d.moved) {
      // Это был клик, а не перетаскивание — открываем фасон.
      router.push(href);
      return;
    }
    const p = positionsRef.current[id];
    fetch(`/api/models/${id}/canvas-position`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) }),
    }).catch(() => showToast("Не удалось сохранить позицию"));
  };

  // ── Кнопки ────────────────────────────────────────────────────────
  const zoomBy = (factor: number) => {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const v = viewRef.current;
    const newScale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
    const k = newScale / v.scale;
    setView({ scale: newScale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k });
  };

  const arrangeGrid = () => {
    const next: Record<string, Pos> = {};
    cards.forEach((c, i) => {
      next[c.id] = gridPos(i);
    });
    setPositions(next);
    fitTo(next);
    fetch("/api/models/board-positions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        positions: cards.map((c) => ({ id: c.id, x: next[c.id].x, y: next[c.id].y })),
      }),
    }).catch(() => showToast("Не удалось сохранить раскладку"));
  };

  const dotSize = 24 * view.scale;

  return (
    <div
      ref={viewportRef}
      className="relative h-[calc(100dvh-4rem)] w-full touch-none select-none overflow-hidden bg-slate-100"
      onPointerDown={onBgPointerDown}
      onPointerMove={onBgPointerMove}
      onPointerUp={onBgPointerUp}
      style={{ cursor: panRef.current ? "grabbing" : "grab" }}
    >
      {/* Точечная сетка как в Miro — двигается вместе с холстом */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, var(--board-dot) 1px, transparent 1px)",
          backgroundSize: `${dotSize}px ${dotSize}px`,
          backgroundPosition: `${view.tx}px ${view.ty}px`,
          opacity: view.scale < 0.4 ? 0.4 : 1,
        }}
      />

      {/* Слой карточек */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}
      >
        {cards.map((c) => {
          const p = positions[c.id];
          if (!p) return null;
          const href = `/models/${c.id}`;
          return (
            <div
              key={c.id}
              className="absolute cursor-grab overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-lg hover:ring-2 hover:ring-blue-200 active:cursor-grabbing"
              style={{ left: p.x, top: p.y, width: CARD_W }}
              onPointerDown={(e) => onCardPointerDown(e, c.id)}
              onPointerMove={onCardPointerMove}
              onPointerUp={(e) => onCardPointerUp(e, c.id, href)}
            >
              {c.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.photo}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="aspect-square w-full bg-slate-100 object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-2 text-center text-[11px] text-slate-500">
                  {c.name}
                </div>
              )}
              <div className="space-y-1 p-2">
                <div className="line-clamp-1 text-[13px] font-semibold leading-tight text-slate-900">
                  {c.name}
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  {c.brandLabel} · {c.category}
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: c.statusDot }}
                    />
                    {c.statusLabel}
                  </span>
                  {c.colorChips.length > 0 && (
                    <span className="flex items-center gap-0.5" title={c.colorChips.map((x) => x.name).join(", ")}>
                      {c.colorChips.slice(0, 5).map((cc, i) => (
                        <span
                          key={i}
                          className="inline-block h-3 w-3 rounded-full ring-1 ring-slate-200"
                          style={{ backgroundColor: cc.hex }}
                          aria-label={cc.name}
                        />
                      ))}
                      {c.colorChips.length > 5 && (
                        <span className="text-[9px] text-slate-400">+{c.colorChips.length - 5}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Подсказка сверху-слева */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-white/80 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm backdrop-blur">
        Фасонов на доске: <b className="text-slate-700">{cards.length}</b> · тащи фон — двигать холст · колесо — зум · клик по карточке — открыть
      </div>

      {/* Панель управления снизу-справа.
          stopPropagation на pointerdown — иначе клик по кнопке всплывёт на фон,
          фон захватит указатель (setPointerCapture) и onClick кнопки не сработает. */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute bottom-4 right-4 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-md"
      >
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.25)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-600 hover:bg-slate-100"
          title="Отдалить"
        >
          −
        </button>
        <span className="w-12 text-center text-xs tabular-nums text-slate-500">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomBy(1.25)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-600 hover:bg-slate-100"
          title="Приблизить"
        >
          +
        </button>
        <div className="mx-1 h-5 w-px bg-slate-200" />
        <button
          type="button"
          onClick={() => fitTo(positionsRef.current)}
          className="flex h-8 items-center justify-center rounded-lg px-2.5 text-xs text-slate-600 hover:bg-slate-100"
          title="Вписать всё в экран"
        >
          ⊡ В размер
        </button>
        <button
          type="button"
          onClick={arrangeGrid}
          className="flex h-8 items-center justify-center rounded-lg px-2.5 text-xs text-slate-600 hover:bg-slate-100"
          title="Разложить все карточки аккуратной сеткой по категориям"
        >
          ▦ Сеткой
        </button>
      </div>

      {toast && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
