"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PhotoThumb } from "./photo-thumb";
import { PACKAGING_TYPE_LABELS } from "@/lib/constants";
import { PackagingType } from "@prisma/client";

export type PackagingPickerOption = {
  id: string;
  name: string;
  type: PackagingType;
  photoUrl?: string | null;
};

type Props = {
  value: string;
  options: PackagingPickerOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
};

export function PackagingPicker({ value, options, onChange, placeholder = "— выбрать —", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value) ?? null;

  // Позиционируем дропдаун под кнопкой через viewport-координаты, чтобы рендерить
  // его в document.body (Portal) — так он гарантированно над любыми sticky-барами
  // и не зажимается родительским overflow/transform.
  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:border-slate-400"
      >
        {current ? (
          <PackagingRow option={current} />
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <span className="ml-auto text-xs text-slate-400">▼</span>
      </button>

      {open && rect && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 9999 }}
          className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400">Нет доступных вариантов</div>
          )}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                o.id === value ? "bg-slate-100" : "hover:bg-slate-50"
              }`}
            >
              <PackagingRow option={o} />
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

function PackagingRow({ option }: { option: PackagingPickerOption }) {
  return (
    <>
      {option.photoUrl ? (
        <PhotoThumb url={option.photoUrl} size={28} />
      ) : (
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
          нет фото
        </span>
      )}
      <span className="truncate">
        <span className="text-xs text-slate-500">{PACKAGING_TYPE_LABELS[option.type]}</span>
        <span className="ml-1.5 font-medium text-slate-900">{option.name}</span>
      </span>
    </>
  );
}
