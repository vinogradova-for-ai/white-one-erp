"use client";

import { useEffect, useRef } from "react";
import type { GanttThumbnail } from "./types";
import { colorHexFromName, isLightColor } from "@/lib/color-map";

// ============================================================
// Превью фасонов / упаковки слева
// ============================================================
export function ThumbnailStack({ thumbs, size }: { thumbs: GanttThumbnail[]; size: number }) {
  const visible = thumbs.slice(0, 3);
  const extra = thumbs.length - visible.length;
  return (
    <div className="flex shrink-0 -space-x-2">
      {visible.map((t, i) => (
        <Thumb key={i} thumb={t} z={visible.length - i} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="relative z-0 flex items-center justify-center rounded-md border-2 border-white bg-slate-100 text-[10px] font-medium text-slate-600"
          style={{ width: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

export function Thumb({ thumb, z, size }: { thumb: GanttThumbnail; z: number; size: number }) {
  const colorHex = thumb.colorName ? colorHexFromName(thumb.colorName) : null;
  const isLight = colorHex ? isLightColor(colorHex) : false;
  if (thumb.photoUrl) {
    return (
      // На hover превью увеличивается в 4 раза и поднимается над соседями (z-50).
      // transform-origin: left bottom — превью раскрывается вниз-вправо, а не
      // перекрывает остальные thumb'ы стопки.
      <span
        className="group/thumb relative shrink-0 transition-transform duration-150 ease-out hover:z-50 hover:scale-[4]"
        style={{ zIndex: z, transformOrigin: "left bottom" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb.photoUrl}
          alt={thumb.colorName ?? ""}
          className="rounded-md border-2 border-white object-cover shadow-sm transition-shadow group-hover/thumb:shadow-2xl group-hover/thumb:ring-1 group-hover/thumb:ring-slate-300"
          style={{ width: size, height: size }}
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
        className={`relative shrink-0 rounded-md border-2 border-white ${isLight ? "ring-1 ring-slate-300" : ""}`}
        style={{ backgroundColor: colorHex, zIndex: z, width: size, height: size }}
        title={thumb.colorName ?? ""}
      />
    );
  }
  return (
    <span
      className="relative shrink-0 flex items-center justify-center rounded-md border-2 border-white bg-slate-100 text-[10px] text-slate-400"
      style={{ zIndex: z, width: size, height: size }}
    >
      нет
    </span>
  );
}

export function ResizeHandle({
  current, min, max, onChange, onCommit,
}: {
  current: number;
  min: number;
  max: number;
  onChange: (w: number) => void;
  onCommit: (w: number) => void;
}) {
  const startRef = useRef<{ x: number; w: number } | null>(null);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!startRef.current) return;
      const next = Math.min(max, Math.max(min, startRef.current.w + (e.clientX - startRef.current.x)));
      onChange(next);
    }
    function onUp() {
      if (startRef.current) onCommit(current);
      startRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [current, min, max, onChange, onCommit]);

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      title="Перетащите, чтобы изменить ширину колонки"
      onMouseDown={(e) => {
        e.preventDefault();
        startRef.current = { x: e.clientX, w: current };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      className="absolute -right-1 top-0 z-30 h-full w-2 cursor-col-resize select-none"
    >
      <span className="absolute right-1 top-0 h-full w-px bg-slate-200 transition-colors hover:bg-slate-500" />
    </span>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <span className={`mr-1 inline-block h-2 w-4 rounded-sm ${color} align-middle`} />
      {label}
    </span>
  );
}
