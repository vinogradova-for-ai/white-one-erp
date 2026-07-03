"use client";

import { useEffect, useRef, useState } from "react";
import type { El } from "./board-types";
import { BookmarkIcon, CommentIcon, HeartIcon, SendIcon, VerifiedBadge } from "./board-icons";
import { CARD_FOOTER, CARD_HEADER, DEFAULT_STICKY, STICKY_TEXT, igHandle, scriptCss, tiltFromId } from "./board-utils";

// Карточка-превью в стиле поста Instagram.
export function CardBody({ el }: { el: El }) {
  const c = el.card!;
  const handle = igHandle(c.brandLabel);
  const photos = c.photos?.length ? c.photos : c.photo ? [c.photo] : [];
  const [idx, setIdx] = useState(0);
  const cur = photos.length ? idx % photos.length : 0;
  // §4 UX-аудита: white_one_love — бренд по умолчанию, его ник на каждой
  // карточке — шум. Шапку с ником оставляем только «не-дефолтным» брендам
  // (например «Сердцебиению»), чтобы отличать их с одного взгляда.
  const showBrandHeader = handle !== "white_one_love";
  return (
    <div className="flex h-full w-full cursor-grab flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm active:cursor-grabbing">
      {/* Шапка: аватар + ник + галочка (тонкая) */}
      {showBrandHeader && (
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
      )}

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

// ── Текстовый блок ──────────────────────────────────────
export function TextBody({ el, editing, onCommit }: { el: El; editing: boolean; onCommit: (t: string) => void }) {
  const family = scriptCss(el.fontFamily);
  const style: React.CSSProperties = {
    fontSize: el.fontSize ?? 28,
    fontWeight: el.fontWeight ?? 600,
    color: el.color ?? "var(--foreground)",
    textAlign: (el.align ?? "left") as React.CSSProperties["textAlign"],
    lineHeight: family ? 1.15 : 1.2,
    ...(family ? { fontFamily: family } : {}),
  };
  if (editing) return <EditArea el={el} style={style} transparent onCommit={onCommit} />;
  return (
    <div className="h-full w-full cursor-grab overflow-hidden whitespace-pre-wrap break-words p-1 active:cursor-grabbing" style={style}>
      {el.text || "Текст"}
    </div>
  );
}

// ── Стикер ────────────────────────────────────────────
export function StickyBody({ el, editing, onCommit }: { el: El; editing: boolean; onCommit: (t: string) => void }) {
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

// ── Поле редактирования (textarea поверх элемента) ─────────────
export function EditArea({ el, style, transparent, onCommit }: { el: El; style: React.CSSProperties; transparent?: boolean; onCommit: (t: string) => void }) {
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
