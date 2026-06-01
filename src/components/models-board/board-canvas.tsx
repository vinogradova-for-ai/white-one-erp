"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type BoardCard = {
  id: string;
  name: string;
  brandLabel: string;
  category: string;
  photo: string | null;
  photos: string[];
  statusLabel: string;
  statusDot: string;
  colorChips: Array<{ name: string; hex: string }>;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  z: number | null;
};

export type ItemType = "TEXT" | "STICKY" | "IMAGE";

export type BoardItemData = {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  text: string | null;
  color: string | null;
  fontSize: number | null;
  fontWeight: number | null;
  align: "left" | "center" | "right" | null;
  imageUrl: string | null;
};

// ── Константы ────────────────────────────────────────────────────────
// Карточка-превью в стиле поста Instagram: шапка (аватар+ник) + фото + панель
// действий + подпись. Фото = высота карточки минус шапка и подвал.
const CARD_W = 214;
const CARD_HEADER = 32; // тонкая шапка с аватаром и ником
const CARD_FOOTER = 62; // тонкая панель лайков/коммент + подпись
const CARD_H = CARD_HEADER + 274 + CARD_FOOTER; // фото доминирует (≈74% карточки)
const COLS = 9;
const CELL_W = 244;
const CELL_H = CARD_H + 60;
const PAD = 48;
const MIN_SCALE = 0.1;
const MAX_SCALE = 3.5;
const INITIAL_SCALE = 1.8; // доска открывается крупно (карточки читаемого размера), не «вписать всё»
const VIEW_KEY = "wo-board-view-v2"; // запоминаем масштаб/позицию (localStorage). v2 — сброс старого вида под новый дефолт
const MIN_W = 56;
const MIN_H = 40;

// Pinterest-муд­борд палитра: мягкие десатурированные пастели.
const STICKY_COLORS = ["#FCE7A2", "#F8C9D4", "#CFE3C5", "#BBD6E8", "#DACDEE", "#F4C9A8", "#F4EAD5", "#E2D8C8"];
const DEFAULT_STICKY = STICKY_COLORS[0];
const TEXT_COLORS = ["#111827", "#ffffff", "#ef4444", "#f59e0b", "#10b981", "#2563eb", "#8b5cf6", "#ec4899"];
const STICKY_TEXT = "#3a3733";

// Лёгкий детерминированный наклон стикера (живой коллажный вид как в Pinterest).
function tiltFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return ((h % 100) / 100) * 3.4 - 1.7; // ≈ [-1.7°, +1.7°]
}

type Geom = { x: number; y: number; w: number; h: number; z: number };
type El = {
  key: string;
  kind: "card" | "item";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  // card
  card?: BoardCard;
  // item
  type?: ItemType;
  text?: string | null;
  color?: string | null;
  fontSize?: number | null;
  fontWeight?: number | null;
  align?: "left" | "center" | "right" | null;
  imageUrl?: string | null;
};
type View = { scale: number; tx: number; ty: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v);
const isTmp = (id: string) => id.startsWith("tmp-");

const HANDLES: Array<{ fx: number; fy: number; dx: -1 | 0 | 1; dy: -1 | 0 | 1; cur: string }> = [
  { fx: 0, fy: 0, dx: -1, dy: -1, cur: "nwse-resize" },
  { fx: 0.5, fy: 0, dx: 0, dy: -1, cur: "ns-resize" },
  { fx: 1, fy: 0, dx: 1, dy: -1, cur: "nesw-resize" },
  { fx: 0, fy: 0.5, dx: -1, dy: 0, cur: "ew-resize" },
  { fx: 1, fy: 0.5, dx: 1, dy: 0, cur: "ew-resize" },
  { fx: 0, fy: 1, dx: -1, dy: 1, cur: "nesw-resize" },
  { fx: 0.5, fy: 1, dx: 0, dy: 1, cur: "ns-resize" },
  { fx: 1, fy: 1, dx: 1, dy: 1, cur: "nwse-resize" },
];

export function BoardCanvas({ cards, items }: { cards: BoardCard[]; items: BoardItemData[] }) {
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tmpCounter = useRef(0);

  // ── Начальное состояние элементов ───────────────────────────────────
  const initialEls = useMemo<Record<string, El>>(() => {
    const els: Record<string, El> = {};
    // карточки фасонов
    const unplaced: BoardCard[] = [];
    let maxY = 0;
    for (const c of cards) {
      if (c.x != null && c.y != null) {
        els[`c:${c.id}`] = {
          key: `c:${c.id}`, kind: "card", id: c.id,
          x: c.x, y: c.y, w: c.w ?? CARD_W, h: c.h ?? CARD_H, z: c.z ?? 0, card: c,
        };
        maxY = Math.max(maxY, c.y);
      } else {
        unplaced.push(c);
      }
    }
    const startY = Object.keys(els).length ? maxY + CELL_H : PAD;
    unplaced.forEach((c, i) => {
      els[`c:${c.id}`] = {
        key: `c:${c.id}`, kind: "card", id: c.id,
        x: PAD + (i % COLS) * CELL_W, y: startY + Math.floor(i / COLS) * CELL_H,
        w: c.w ?? CARD_W, h: c.h ?? CARD_H, z: c.z ?? 0, card: c,
      };
    });
    // свободные элементы
    for (const it of items) {
      els[`i:${it.id}`] = {
        key: `i:${it.id}`, kind: "item", id: it.id,
        x: it.x, y: it.y, w: it.w, h: it.h, z: it.z,
        type: it.type, text: it.text, color: it.color,
        fontSize: it.fontSize, fontWeight: it.fontWeight, align: it.align, imageUrl: it.imageUrl,
      };
    }
    return els;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [els, setEls] = useState<Record<string, El>>(initialEls);
  const elsRef = useRef(els);
  elsRef.current = els;

  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // Множественное выделение: массив ключей. selectedKey — когда выделен ровно один.
  const [selection, setSelection] = useState<string[]>([]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const editingRef = useRef(editingKey);
  editingRef.current = editingKey;
  // Рамка-выделение (экранные координаты вьюпорта)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const [stickyPicker, setStickyPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const nextZ = useCallback(() => {
    let mz = 0;
    for (const k in elsRef.current) mz = Math.max(mz, elsRef.current[k].z);
    return mz + 1;
  }, []);

  // ── Сохранение в БД ──────────────────────────────────────────────────
  const persistGeom = useCallback((el: El) => {
    if (isTmp(el.id)) return;
    const body = JSON.stringify({ x: round(el.x), y: round(el.y), w: round(el.w), h: round(el.h), z: el.z });
    const url = el.kind === "card" ? `/api/models/${el.id}/canvas-position` : `/api/board/items/${el.id}`;
    fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body }).catch(() =>
      showToast("Не удалось сохранить"),
    );
  }, [showToast]);

  const persistFields = useCallback((id: string, fields: Record<string, unknown>) => {
    if (isTmp(id)) return;
    fetch(`/api/board/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    }).catch(() => showToast("Не удалось сохранить"));
  }, [showToast]);

  const patchEl = useCallback((key: string, patch: Partial<El>) => {
    setEls((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], ...patch } } : prev));
  }, []);

  // ── Координаты ───────────────────────────────────────────────────────
  const viewCenterWorld = useCallback((): { x: number; y: number } => {
    const el = viewportRef.current;
    const v = viewRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (r.width / 2 - v.tx) / v.scale, y: (r.height / 2 - v.ty) / v.scale };
  }, []);

  const screenToWorld = useCallback((sx: number, sy: number): { x: number; y: number } => {
    const el = viewportRef.current;
    const v = viewRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (sx - r.left - v.tx) / v.scale, y: (sy - r.top - v.ty) / v.scale };
  }, []);

  // ── Вписать всё в экран ──────────────────────────────────────────────
  const fitAll = useCallback(() => {
    const el = viewportRef.current;
    const keys = Object.keys(elsRef.current);
    if (!el || keys.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const k of keys) {
      const e = elsRef.current[k];
      minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x + e.w); maxY = Math.max(maxY, e.y + e.h);
    }
    const r = el.getBoundingClientRect();
    const pad = 70;
    const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
    const scale = clamp(Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h), MIN_SCALE, 1.1);
    setView({
      scale,
      tx: (r.width - w * scale) / 2 - minX * scale,
      ty: (r.height - h * scale) / 2 - minY * scale,
    });
  }, []);

  // Открыть крупно в левом-верхнем углу контента (дефолт, если нет сохранённого вида).
  const resetInitial = useCallback(() => {
    const el = viewportRef.current;
    const keys = Object.keys(elsRef.current);
    if (!el) return;
    let minX = Infinity, minY = Infinity;
    for (const k of keys) { const e = elsRef.current[k]; minX = Math.min(minX, e.x); minY = Math.min(minY, e.y); }
    if (!Number.isFinite(minX)) { minX = 0; minY = 0; }
    const pad = 40;
    setView({ scale: INITIAL_SCALE, tx: pad - minX * INITIAL_SCALE, ty: pad - minY * INITIAL_SCALE });
  }, []);

  // При входе: восстановить сохранённый масштаб/позицию, иначе — открыть крупно.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (typeof v?.scale === "number" && typeof v?.tx === "number" && typeof v?.ty === "number") {
          setView({ scale: clamp(v.scale, MIN_SCALE, MAX_SCALE), tx: v.tx, ty: v.ty });
          return;
        }
      }
    } catch {}
    resetInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Запоминаем вид (debounce), чтобы доска открывалась там же, где оставили.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch {}
    }, 400);
    return () => window.clearTimeout(t);
  }, [view]);

  // ── Зум колесом ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const k = ns / v.scale;
      setView({ scale: ns, tx: mx - (mx - v.tx) * k, ty: my - (my - v.ty) * k });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Клавиатура: Delete удаляет, Esc снимает выделение/выходит из правки ─
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingRef.current) { if (e.key === "Escape") (document.activeElement as HTMLElement)?.blur(); return; }
      if (e.key === "Escape") { setSelection([]); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        const itemKeys = selectionRef.current.filter((k) => elsRef.current[k]?.kind === "item");
        if (itemKeys.length) { e.preventDefault(); itemKeys.forEach((k) => deleteItem(k)); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Фон: панорама (drag) или рамка-выделение (Shift+drag) ─────────────
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const marqueeRef = useRef<{ sx: number; sy: number; base: string[] } | null>(null);

  const onBgPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setStickyPicker(false);
    const r = viewportRef.current?.getBoundingClientRect();
    if (e.shiftKey && r) {
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      marqueeRef.current = { sx, sy, base: selectionRef.current };
      setMarquee({ x0: sx, y0: sy, x1: sx, y1: sy });
    } else {
      panRef.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false };
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBgPointerMove = (e: React.PointerEvent) => {
    const m = marqueeRef.current;
    const r = viewportRef.current?.getBoundingClientRect();
    if (m && r) {
      setMarquee({ x0: m.sx, y0: m.sy, x1: e.clientX - r.left, y1: e.clientY - r.top });
      return;
    }
    const p = panRef.current;
    if (!p) return;
    if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 3) p.moved = true;
    setView((v) => ({ ...v, tx: p.tx + (e.clientX - p.x), ty: p.ty + (e.clientY - p.y) }));
  };
  const onBgPointerUp = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    const m = marqueeRef.current;
    if (m) {
      marqueeRef.current = null;
      setMarquee(null);
      const r = viewportRef.current?.getBoundingClientRect();
      if (!r) return;
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      // крошечная рамка = клик: снять выделение
      if (Math.abs(cx - m.sx) + Math.abs(cy - m.sy) < 5) { setSelection([]); return; }
      const rx0 = Math.min(m.sx, cx), ry0 = Math.min(m.sy, cy), rx1 = Math.max(m.sx, cx), ry1 = Math.max(m.sy, cy);
      const v = viewRef.current;
      const hit = new Set(m.base);
      for (const k in elsRef.current) {
        const el = elsRef.current[k];
        const ex0 = el.x * v.scale + v.tx, ey0 = el.y * v.scale + v.ty;
        const ex1 = (el.x + el.w) * v.scale + v.tx, ey1 = (el.y + el.h) * v.scale + v.ty;
        if (ex0 < rx1 && ex1 > rx0 && ey0 < ry1 && ey1 > ry0) hit.add(k);
      }
      setSelection([...hit]);
      return;
    }
    const p = panRef.current;
    panRef.current = null;
    if (p && !p.moved) setSelection([]); // клик по пустому фону — снять выделение
  };

  // ── Перетаскивание элемента (с поддержкой группы) ─────────────────────
  const dragRef = useRef<{ keys: string[]; px: number; py: number; origins: Record<string, { x: number; y: number }>; moved: boolean } | null>(null);
  const onElPointerDown = (e: React.PointerEvent, key: string) => {
    if (e.button !== 0) return;
    if (editingRef.current === key) return; // в режиме правки не таскаем
    e.stopPropagation();
    setStickyPicker(false);
    if (e.shiftKey) {
      // Shift+клик — добавить/убрать из выделения, без перетаскивания
      setSelection((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
      return;
    }
    // если кликнули по уже выделенному — тащим всю группу; иначе выделяем только этот
    const cur = selectionRef.current;
    const keys = cur.includes(key) ? cur : [key];
    if (!cur.includes(key)) setSelection(keys);
    const origins: Record<string, { x: number; y: number }> = {};
    for (const k of keys) { const el = elsRef.current[k]; if (el) origins[k] = { x: el.x, y: el.y }; }
    dragRef.current = { keys, px: e.clientX, py: e.clientY, origins, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onElPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dxs = e.clientX - d.px, dys = e.clientY - d.py;
    if (!d.moved && Math.abs(dxs) + Math.abs(dys) > 4) d.moved = true;
    if (!d.moved) return;
    const s = viewRef.current.scale;
    setEls((prev) => {
      const next = { ...prev };
      for (const k of d.keys) {
        const o = d.origins[k];
        if (o && next[k]) next[k] = { ...next[k], x: o.x + dxs / s, y: o.y + dys / s };
      }
      return next;
    });
  };
  const onElPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (d && d.moved) for (const k of d.keys) { const el = elsRef.current[k]; if (el) persistGeom(el); }
  };

  const onElDoubleClick = (e: React.PointerEvent, key: string) => {
    e.stopPropagation();
    const el = elsRef.current[key];
    if (!el) return;
    if (el.kind === "card") { router.push(`/models/${el.id}`); return; }
    if (el.type === "TEXT" || el.type === "STICKY") setEditingKey(key);
  };

  // ── Ресайз ───────────────────────────────────────────────────────────
  const resizeRef = useRef<
    { key: string; px: number; py: number; g: Geom; dx: number; dy: number } | null
  >(null);
  const onHandlePointerDown = (e: React.PointerEvent, key: string, dx: number, dy: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = elsRef.current[key];
    resizeRef.current = { key, px: e.clientX, py: e.clientY, g: { x: el.x, y: el.y, w: el.w, h: el.h, z: el.z }, dx, dy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const s = viewRef.current.scale;
    const mdx = (e.clientX - r.px) / s, mdy = (e.clientY - r.py) / s;
    let { x, y, w, h } = r.g;
    if (r.dx === 1) w = Math.max(MIN_W, r.g.w + mdx);
    if (r.dx === -1) { w = Math.max(MIN_W, r.g.w - mdx); x = r.g.x + (r.g.w - w); }
    if (r.dy === 1) h = Math.max(MIN_H, r.g.h + mdy);
    if (r.dy === -1) { h = Math.max(MIN_H, r.g.h - mdy); y = r.g.y + (r.g.h - h); }
    patchEl(r.key, { x, y, w, h });
  };
  const onHandlePointerUp = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    resizeRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (r) { const el = elsRef.current[r.key]; if (el) persistGeom(el); }
  };

  // ── Создание элементов ───────────────────────────────────────────────
  const createItem = useCallback(
    async (init: { type: ItemType; w: number; h: number; at?: { x: number; y: number } } & Partial<El>) => {
      const center = init.at ?? viewCenterWorld();
      const z = nextZ();
      const tmpId = `tmp-${tmpCounter.current++}`;
      const tmpKey = `i:${tmpId}`;
      const base: El = {
        key: tmpKey, kind: "item", id: tmpId,
        x: center.x - init.w / 2, y: center.y - init.h / 2, w: init.w, h: init.h, z,
        type: init.type,
        text: init.text ?? null, color: init.color ?? null,
        fontSize: init.fontSize ?? null, fontWeight: init.fontWeight ?? null,
        align: init.align ?? null, imageUrl: init.imageUrl ?? null,
      };
      setEls((prev) => ({ ...prev, [tmpKey]: base }));
      setSelection([tmpKey]);
      try {
        const res = await fetch("/api/board/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: base.type, x: round(base.x), y: round(base.y), w: round(base.w), h: round(base.h), z,
            text: base.text, color: base.color, fontSize: base.fontSize, fontWeight: base.fontWeight,
            align: base.align, imageUrl: base.imageUrl,
          }),
        });
        if (!res.ok) throw new Error();
        const { item } = (await res.json()) as { item: { id: string } };
        const realKey = `i:${item.id}`;
        setEls((prev) => {
          const cur = prev[tmpKey];
          if (!cur) return prev;
          const next = { ...prev };
          delete next[tmpKey];
          next[realKey] = { ...cur, key: realKey, id: item.id };
          return next;
        });
        setSelection((prev) => prev.map((k) => (k === tmpKey ? realKey : k)));
      } catch {
        showToast("Не удалось создать элемент");
        setEls((prev) => { const n = { ...prev }; delete n[tmpKey]; return n; });
      }
    },
    [nextZ, showToast, viewCenterWorld],
  );

  const addText = () =>
    createItem({ type: "TEXT", w: 240, h: 70, text: "Текст", fontSize: 28, fontWeight: 600, align: "left" });
  const addSticky = (color: string) => {
    setStickyPicker(false);
    createItem({ type: "STICKY", w: 200, h: 200, color, text: "", fontSize: 18, fontWeight: 500, align: "left" });
  };

  const addImageFromUrl = useCallback(
    (url: string, natW: number, natH: number, at?: { x: number; y: number }) => {
      const maxSide = 360;
      const ratio = natW > 0 && natH > 0 ? natH / natW : 0.75;
      const w = Math.min(maxSide, natW || maxSide);
      const h = w * ratio;
      createItem({ type: "IMAGE", w, h, imageUrl: url, at });
    },
    [createItem],
  );

  const uploadAndAdd = useCallback(
    async (file: File, at?: { x: number; y: number }) => {
      if (!file.type.startsWith("image/")) { showToast("Только картинки"); return; }
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        if (!res.ok) throw new Error();
        const { urls } = (await res.json()) as { urls: string[] };
        const url = urls[0];
        if (!url) throw new Error();
        const img = new Image();
        img.onload = () => addImageFromUrl(url, img.naturalWidth, img.naturalHeight, at);
        img.onerror = () => addImageFromUrl(url, 360, 270, at);
        img.src = url;
      } catch {
        showToast("Не удалось загрузить картинку");
      } finally {
        setUploading(false);
      }
    },
    [addImageFromUrl, showToast],
  );

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadAndAdd(f);
    e.target.value = "";
  };

  // вставка картинки из буфера
  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (item) { const f = item.getAsFile(); if (f) { e.preventDefault(); uploadAndAdd(f); } }
  };
  // drop файла на холст
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith("image/"));
    if (f) uploadAndAdd(f, screenToWorld(e.clientX, e.clientY));
  };

  // ── Операции над выделенным ──────────────────────────────────────────
  const deleteItem = useCallback((key: string) => {
    const el = elsRef.current[key];
    if (!el || el.kind !== "item") return;
    setEls((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setSelection((prev) => prev.filter((k) => k !== key));
    if (!isTmp(el.id)) fetch(`/api/board/items/${el.id}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const bringFront = (key: string) => {
    const z = nextZ();
    patchEl(key, { z });
    const el = elsRef.current[key];
    if (el) { if (el.kind === "card") persistGeom({ ...el, z }); else persistFields(el.id, { z }); }
  };

  // Операции над группой выделенных
  const deleteSelection = () => {
    selectionRef.current.filter((k) => elsRef.current[k]?.kind === "item").forEach((k) => deleteItem(k));
  };
  const bringFrontSelection = () => {
    selectionRef.current.forEach((k) => bringFront(k));
  };

  const duplicateItem = (key: string) => {
    const el = elsRef.current[key];
    if (!el || el.kind !== "item" || !el.type) return;
    createItem({
      type: el.type, w: el.w, h: el.h,
      at: { x: el.x + el.w / 2 + 24, y: el.y + el.h / 2 + 24 },
      text: el.text, color: el.color, fontSize: el.fontSize, fontWeight: el.fontWeight,
      align: el.align, imageUrl: el.imageUrl,
    });
  };

  const setItemField = (key: string, field: keyof El, value: unknown) => {
    patchEl(key, { [field]: value } as Partial<El>);
    const el = elsRef.current[key];
    if (el) persistFields(el.id, { [field]: value });
  };

  const resetCardSize = (key: string) => {
    patchEl(key, { w: CARD_W, h: CARD_H });
    const el = elsRef.current[key];
    if (el) persistGeom({ ...el, w: CARD_W, h: CARD_H });
  };

  // ── Зум-кнопки / раскладка ───────────────────────────────────────────
  const zoomBy = (factor: number) => {
    const el = viewportRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2, v = viewRef.current;
    const ns = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE), k = ns / v.scale;
    setView({ scale: ns, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k });
  };

  const arrangeGrid = () => {
    const cardEls = Object.values(elsRef.current)
      .filter((e) => e.kind === "card")
      .sort((a, b) => a.id.localeCompare(b.id));
    const updates = cardEls.map((e, i) => ({
      id: e.id, key: e.key,
      x: PAD + (i % COLS) * CELL_W, y: PAD + Math.floor(i / COLS) * CELL_H,
    }));
    setEls((prev) => {
      const next = { ...prev };
      for (const u of updates) next[u.key] = { ...next[u.key], x: u.x, y: u.y, w: CARD_W, h: CARD_H };
      return next;
    });
    fetch("/api/models/board-positions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positions: updates.map((u) => ({ id: u.id, x: u.x, y: u.y, w: CARD_W, h: CARD_H })) }),
    }).catch(() => showToast("Не удалось сохранить раскладку"));
    // Не «вписываем всё» (это делало карточки мелкими) — оставляем крупный
    // стартовый масштаб и переходим к левому-верхнему углу сетки.
    window.setTimeout(resetInitial, 0);
  };

  const cardCount = Object.values(els).filter((e) => e.kind === "card").length;
  const dotSize = 24 * view.scale;
  const sorted = Object.values(els).sort((a, b) => a.z - b.z);
  const selectedKey = selection.length === 1 ? selection[0] : null;
  const selectionSet = new Set(selection);
  const selected = selectedKey ? els[selectedKey] : null;
  const handleSize = Math.max(8, 11 / view.scale);

  return (
    <div
      ref={viewportRef}
      className="relative h-[calc(100dvh-4rem)] w-full touch-none select-none overflow-hidden bg-slate-100"
      onPointerDown={onBgPointerDown}
      onPointerMove={onBgPointerMove}
      onPointerUp={onBgPointerUp}
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{ cursor: panRef.current ? "grabbing" : "grab" }}
    >
      {/* Точечная сетка */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, var(--board-dot) 1px, transparent 1px)",
          backgroundSize: `${dotSize}px ${dotSize}px`,
          backgroundPosition: `${view.tx}px ${view.ty}px`,
          opacity: view.scale < 0.4 ? 0.4 : 1,
        }}
      />

      {/* Слой элементов */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}
      >
        {sorted.map((el) => {
          const isSel = selectionSet.has(el.key);
          const single = selection.length === 1 && isSel;
          const isEditing = el.key === editingKey;
          return (
            <div
              key={el.key}
              className="absolute"
              style={{ left: el.x, top: el.y, width: el.w, height: el.h, zIndex: el.z }}
              onPointerDown={(e) => onElPointerDown(e, el.key)}
              onPointerMove={onElPointerMove}
              onPointerUp={onElPointerUp}
              onDoubleClick={(e) => onElDoubleClick(e as unknown as React.PointerEvent, el.key)}
            >
              {/* содержимое */}
              {el.kind === "card" && el.card ? (
                <CardBody el={el} />
              ) : el.type === "STICKY" ? (
                <StickyBody el={el} editing={isEditing} onCommit={(t) => { setEditingKey(null); setItemField(el.key, "text", t); }} />
              ) : el.type === "TEXT" ? (
                <TextBody el={el} editing={isEditing} onCommit={(t) => { setEditingKey(null); setItemField(el.key, "text", t); }} />
              ) : el.type === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={el.imageUrl ?? ""} alt="" draggable={false} className="h-full w-full rounded-lg object-cover shadow-sm" />
              ) : null}

              {/* рамка выделения + ручки ресайза (ручки только при одиночном выборе) */}
              {isSel && !isEditing && (
                <>
                  <div
                    className={`pointer-events-none absolute -inset-[2px] rounded-[10px] ring-2 ${single ? "ring-blue-500" : "ring-blue-400"}`}
                    style={{ borderRadius: 10 }}
                  />
                  {single && HANDLES.map((hd, i) => (
                    <div
                      key={i}
                      onPointerDown={(e) => onHandlePointerDown(e, el.key, hd.dx, hd.dy)}
                      onPointerMove={onHandlePointerMove}
                      onPointerUp={onHandlePointerUp}
                      className="absolute rounded-full border border-blue-500 bg-white"
                      style={{
                        width: handleSize, height: handleSize,
                        left: hd.fx * el.w - handleSize / 2,
                        top: hd.fy * el.h - handleSize / 2,
                        cursor: hd.cur,
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Рамка-выделение (Shift+тащить по фону) */}
      {marquee && (
        <div
          className="pointer-events-none absolute z-20 rounded-sm border border-blue-500 bg-blue-500/10"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}

      {/* ВЕРХНЯЯ ПАНЕЛЬ: добавление + контекст выделения */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute left-1/2 top-3 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur"
      >
        <button type="button" onClick={addText} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-700 hover:bg-slate-100" title="Добавить текст">
          <span className="text-base font-semibold">T</span> Текст
        </button>

        <div className="relative">
          <button type="button" onClick={() => setStickyPicker((s) => !s)} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-700 hover:bg-slate-100" title="Добавить стикер">
            <span className="inline-block h-3.5 w-3.5 rounded-[3px] bg-amber-300 ring-1 ring-amber-400" /> Стикер
          </button>
          {stickyPicker && (
            <div className="absolute left-0 top-10 z-10 flex w-44 flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              {STICKY_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => addSticky(c)} className="h-7 w-7 rounded-md ring-1 ring-slate-300 transition-transform hover:scale-110" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-slate-700 hover:bg-slate-100" title="Добавить картинку (или просто вставьте ⌘V / перетащите файл)">
          <span className="text-base">🖼</span> Картинка
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFilePick} />
        {uploading && <span className="px-1 text-xs text-slate-400">загрузка…</span>}

        {/* контекст: группа выделенных */}
        {selection.length > 1 && (
          <>
            <div className="mx-1 h-6 w-px bg-slate-200" />
            <span className="px-1.5 text-sm text-slate-600">Выбрано: <b className="text-slate-900">{selection.length}</b></span>
            <button type="button" onClick={bringFrontSelection} className="flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm text-slate-700 hover:bg-slate-100" title="На передний план">⤴</button>
            <button type="button" onClick={deleteSelection} className="flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm text-red-600 hover:bg-red-50" title="Удалить выделенные (стикеры/текст/картинки)">🗑</button>
            <button type="button" onClick={() => setSelection([])} className="flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm text-slate-500 hover:bg-slate-100" title="Снять выделение">✕</button>
          </>
        )}

        {/* контекст: один элемент */}
        {selected && (
          <>
            <div className="mx-1 h-6 w-px bg-slate-200" />
            <SelectionControls
              el={selected}
              onFontSize={(d) => setItemField(selected.key, "fontSize", clamp((selected.fontSize ?? 24) + d, 8, 200))}
              onBold={() => setItemField(selected.key, "fontWeight", (selected.fontWeight ?? 400) >= 700 ? 400 : 700)}
              onAlign={(a) => setItemField(selected.key, "align", a)}
              onColor={(c) => setItemField(selected.key, "color", c)}
              onFront={() => bringFront(selected.key)}
              onDuplicate={() => duplicateItem(selected.key)}
              onDelete={() => deleteItem(selected.key)}
              onOpen={() => router.push(`/models/${selected.id}`)}
              onResetSize={() => resetCardSize(selected.key)}
              onEdit={() => setEditingKey(selected.key)}
            />
          </>
        )}
      </div>

      {/* Подсказка — внизу слева (там пусто), прячем при выделении, чтобы не мешала тулбару */}
      {selection.length === 0 && (
        <div className="pointer-events-none absolute bottom-4 left-4 hidden max-w-[min(60vw,680px)] rounded-lg bg-white/80 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm backdrop-blur md:block">
          Фасонов: <b className="text-slate-700">{cardCount}</b> · <b className="text-slate-700">Shift+тащить</b> — выделить группу · Shift+клик — добавить · 2× клик по карточке — открыть · ⌘V — картинка
        </div>
      )}

      {/* Нижняя панель: зум / fit / сетка */}
      <div onPointerDown={(e) => e.stopPropagation()} className="absolute bottom-4 right-4 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-md">
        <button type="button" onClick={() => zoomBy(1 / 1.25)} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-600 hover:bg-slate-100" title="Отдалить">−</button>
        <span className="w-12 text-center text-xs tabular-nums text-slate-500">{Math.round(view.scale * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.25)} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-600 hover:bg-slate-100" title="Приблизить">+</button>
        <div className="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" onClick={fitAll} className="flex h-8 items-center justify-center rounded-lg px-2.5 text-xs text-slate-600 hover:bg-slate-100" title="Вписать всё в экран">⊡ В размер</button>
        <button type="button" onClick={arrangeGrid} className="flex h-8 items-center justify-center rounded-lg px-2.5 text-xs text-slate-600 hover:bg-slate-100" title="Разложить карточки фасонов сеткой">▦ Сеткой</button>
      </div>

      {toast && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}

// ── Карточка фасона ────────────────────────────────────────────────────
function igHandle(brandLabel: string): string {
  const l = brandLabel.toLowerCase();
  if (l.includes("white")) return "white_one_love";
  if (l.includes("сердц")) return "serdcebienie";
  return brandLabel.toLowerCase().replace(/\s+/g, "_") || "white_one_love";
}

const IG_ICON = "shrink-0 text-slate-900";
function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={IG_ICON}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.5 4.04 3 5.5l7 7Z" />
    </svg>
  );
}
function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={IG_ICON}>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={IG_ICON}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}
function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={IG_ICON}>
      <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}
function VerifiedBadge() {
  return (
    <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#3897f0]">
      <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l4 4L19 7" />
      </svg>
    </span>
  );
}

// Карточка-превью в стиле поста Instagram.
function CardBody({ el }: { el: El }) {
  const c = el.card!;
  const handle = igHandle(c.brandLabel);
  const photos = c.photos?.length ? c.photos : c.photo ? [c.photo] : [];
  const [idx, setIdx] = useState(0);
  const cur = photos.length ? idx % photos.length : 0;
  return (
    <div className="flex h-full w-full cursor-grab flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm active:cursor-grabbing">
      {/* Шапка: аватар + ник + галочка (тонкая) */}
      <div className="flex items-center gap-1.5 px-2" style={{ height: CARD_HEADER }}>
        <span className="shrink-0 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 p-[1.5px]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[9px] font-bold uppercase text-slate-700">
            {handle[0]}
          </span>
        </span>
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-[11px] font-semibold leading-none text-slate-900">{handle}</span>
          <VerifiedBadge />
        </div>
        <span className="ml-auto text-[13px] leading-none text-slate-500">⋯</span>
      </div>

      {/* Фото — карусель, если их несколько (как в Instagram) */}
      <div className="group/ph relative min-h-0 w-full flex-1 overflow-hidden bg-slate-100">
        {photos.length > 0 ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos[cur]} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + photos.length) % photos.length); }}
                  className="absolute left-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-base text-slate-700 opacity-0 shadow transition group-hover/ph:opacity-100"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % photos.length); }}
                  className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-base text-slate-700 opacity-0 shadow transition group-hover/ph:opacity-100"
                >
                  ›
                </button>
                <div className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
                  {cur + 1}/{photos.length}
                </div>
                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1">
                  {photos.slice(0, 8).map((_, i) => (
                    <span key={i} className={`h-1.5 rounded-full transition-all ${i === cur ? "w-3 bg-white" : "w-1.5 bg-white/60"}`} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-2 text-center text-[11px] text-slate-500">
            {c.name}
          </div>
        )}
      </div>

      {/* Подвал: панель действий + подпись + статус (тонкий) */}
      <div className="flex flex-col gap-0.5 px-2 pb-1.5 pt-1" style={{ height: CARD_FOOTER }}>
        <div className="flex items-center">
          <span className="flex items-center gap-2.5">
            <HeartIcon />
            <CommentIcon />
            <SendIcon />
          </span>
          <span className="ml-auto">
            <BookmarkIcon />
          </span>
        </div>
        <div className="line-clamp-1 text-[11px] leading-tight text-slate-900">
          <span className="font-semibold">{handle}</span> {c.name}
        </div>
        <div className="mt-auto flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1 truncate text-[10px] text-slate-500">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.statusDot }} />
            {c.statusLabel}
          </span>
          {c.colorChips.length > 0 && (
            <span className="flex shrink-0 items-center gap-0.5">
              {c.colorChips.slice(0, 5).map((cc, i) => (
                <span key={i} className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-slate-200" style={{ backgroundColor: cc.hex }} />
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Текстовый блок ─────────────────────────────────────────────────────
function TextBody({ el, editing, onCommit }: { el: El; editing: boolean; onCommit: (t: string) => void }) {
  const style: React.CSSProperties = {
    fontSize: el.fontSize ?? 28,
    fontWeight: el.fontWeight ?? 600,
    color: el.color ?? "var(--foreground)",
    textAlign: (el.align ?? "left") as React.CSSProperties["textAlign"],
    lineHeight: 1.2,
  };
  if (editing) return <EditArea el={el} style={style} transparent onCommit={onCommit} />;
  return (
    <div className="h-full w-full cursor-grab overflow-hidden whitespace-pre-wrap break-words p-1 active:cursor-grabbing" style={style}>
      {el.text || "Текст"}
    </div>
  );
}

// ── Стикер ─────────────────────────────────────────────────────────────
function StickyBody({ el, editing, onCommit }: { el: El; editing: boolean; onCommit: (t: string) => void }) {
  const color = el.color ?? DEFAULT_STICKY;
  const tilt = editing ? 0 : tiltFromId(el.id);
  const style: React.CSSProperties = {
    fontSize: el.fontSize ?? 18,
    fontWeight: el.fontWeight ?? 500,
    color: STICKY_TEXT,
    textAlign: (el.align ?? "left") as React.CSSProperties["textAlign"],
    lineHeight: 1.3,
  };
  return (
    <div
      className="relative h-full w-full cursor-grab active:cursor-grabbing"
      style={{ transform: `rotate(${tilt}deg)`, transformOrigin: "center" }}
    >
      {/* «washi-скотч» сверху — как будто стикер приклеен к доске */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 z-10"
        style={{
          width: 58,
          height: 18,
          transform: "translateX(-50%) rotate(-5deg)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.32))",
          border: "1px solid rgba(255,255,255,0.6)",
          borderRadius: 2,
          boxShadow: "0 1px 3px rgba(0,0,0,0.10)",
        }}
      />
      {/* сам листок-заметка */}
      <div
        className="absolute inset-x-0 bottom-0 overflow-hidden rounded-2xl"
        style={{
          top: 11,
          background: `linear-gradient(155deg, rgba(255,255,255,0.48), rgba(0,0,0,0.05)), ${color}`,
          boxShadow: "0 10px 24px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08)",
        }}
      >
        {editing ? (
          <div className="h-full w-full p-3.5">
            <EditArea el={el} style={style} transparent onCommit={onCommit} />
          </div>
        ) : el.text ? (
          <div className="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-3.5" style={style}>
            {el.text}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center p-3.5 text-center text-[12px] italic" style={{ color: "rgba(58,55,51,0.4)" }}>
            двойной клик — добавить текст
          </div>
        )}
        {/* загнутый уголок */}
        <span
          className="pointer-events-none absolute bottom-0 right-0"
          style={{
            width: 0,
            height: 0,
            borderStyle: "solid",
            borderWidth: "0 0 18px 18px",
            borderColor: "transparent transparent rgba(0,0,0,0.10) rgba(255,255,255,0.5)",
          }}
        />
      </div>
    </div>
  );
}

// ── Поле редактирования (textarea поверх элемента) ─────────────────────
function EditArea({ el, style, transparent, onCommit }: { el: El; style: React.CSSProperties; transparent?: boolean; onCommit: (t: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [val, setVal] = useState(el.text ?? "");
  useEffect(() => {
    const t = ref.current;
    if (t) { t.focus(); t.select(); }
  }, []);
  return (
    <textarea
      ref={ref}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => onCommit(val)}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCommit(val); } e.stopPropagation(); }}
      className="h-full w-full resize-none border-0 p-1 outline-none"
      style={{ ...style, background: transparent ? "transparent" : "white" }}
    />
  );
}

// ── Контекстные контролы выделения ─────────────────────────────────────
function SelectionControls({
  el, onFontSize, onBold, onAlign, onColor, onFront, onDuplicate, onDelete, onOpen, onResetSize, onEdit,
}: {
  el: El;
  onFontSize: (d: number) => void;
  onBold: () => void;
  onAlign: (a: "left" | "center" | "right") => void;
  onColor: (c: string) => void;
  onFront: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpen: () => void;
  onResetSize: () => void;
  onEdit: () => void;
}) {
  const btn = "flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm text-slate-700 hover:bg-slate-100";
  const isText = el.type === "TEXT";
  const isSticky = el.type === "STICKY";
  const isCard = el.kind === "card";
  const bold = (el.fontWeight ?? 400) >= 700;

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      {isCard && (
        <>
          <button type="button" className={btn} onClick={onOpen} title="Открыть фасон">Открыть</button>
          <button type="button" className={btn} onClick={onResetSize} title="Сбросить размер карточки">↺ размер</button>
        </>
      )}

      {(isText || isSticky) && (
        <>
          <button type="button" className={btn} onClick={onEdit} title="Редактировать текст">✎</button>
          <button type="button" className={btn} onClick={() => onFontSize(-2)} title="Меньше">A−</button>
          <span className="w-7 text-center text-xs tabular-nums text-slate-500">{el.fontSize ?? 24}</span>
          <button type="button" className={btn} onClick={() => onFontSize(2)} title="Больше">A+</button>
          <button type="button" className={`${btn} ${bold ? "bg-slate-200" : ""} font-bold`} onClick={onBold} title="Жирный">B</button>
          <button type="button" className={btn} onClick={() => onAlign("left")} title="Влево">⇤</button>
          <button type="button" className={btn} onClick={() => onAlign("center")} title="По центру">≡</button>
          <button type="button" className={btn} onClick={() => onAlign("right")} title="Вправо">⇥</button>
        </>
      )}

      {isText && (
        <span className="flex items-center gap-1 px-1">
          {TEXT_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => onColor(c)} className="h-5 w-5 rounded-full ring-1 ring-slate-300 transition-transform hover:scale-110" style={{ backgroundColor: c }} title="Цвет текста" />
          ))}
        </span>
      )}
      {isSticky && (
        <span className="flex items-center gap-1 px-1">
          {STICKY_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => onColor(c)} className="h-5 w-5 rounded-md ring-1 ring-slate-300 transition-transform hover:scale-110" style={{ backgroundColor: c }} title="Цвет стикера" />
          ))}
        </span>
      )}

      {!isCard && (
        <>
          <div className="mx-0.5 h-6 w-px bg-slate-200" />
          <button type="button" className={btn} onClick={onFront} title="На передний план">⤴</button>
          <button type="button" className={btn} onClick={onDuplicate} title="Дублировать">⎘</button>
          <button type="button" className={`${btn} text-red-600 hover:bg-red-50`} onClick={onDelete} title="Удалить">🗑</button>
        </>
      )}
      {isCard && (
        <>
          <div className="mx-0.5 h-6 w-px bg-slate-200" />
          <button type="button" className={btn} onClick={onFront} title="На передний план">⤴</button>
        </>
      )}
    </div>
  );
}
