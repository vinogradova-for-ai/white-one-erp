"use client";

import { useEffect, useRef, useState } from "react";
import { colorHexFromName, isLightColor } from "@/lib/color-map";
import { PhotoThumb } from "./photo-thumb";

type Option = {
  id: string;
  sku: string;
  colorName: string;
  photoUrl?: string | null;
  disabled?: boolean;
  disabledHint?: string;
};

type Props = {
  value: string;
  options: Option[];
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
};

export function VariantPicker({ value, options, onChange, placeholder = "Выберите цвет", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1.5 text-left text-sm hover:border-slate-400"
      >
        {current ? (
          <VariantRow sku={current.sku} colorName={current.colorName} photoUrl={current.photoUrl} />
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <span className="ml-auto text-xs text-slate-400">▼</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400">Нет доступных цветов</div>
          )}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={o.disabled}
              onClick={() => {
                if (o.disabled) return;
                onChange(o.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${
                o.disabled
                  ? "cursor-not-allowed opacity-50"
                  : o.id === value
                  ? "bg-slate-100"
                  : "hover:bg-slate-50"
              }`}
            >
              <VariantRow sku={o.sku} colorName={o.colorName} photoUrl={o.photoUrl} />
              {o.disabled && o.disabledHint && (
                <span className="ml-auto shrink-0 text-xs text-slate-400">{o.disabledHint}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VariantRow({
  sku,
  colorName,
  photoUrl,
}: {
  sku: string;
  colorName: string;
  photoUrl?: string | null;
}) {
  const hex = colorHexFromName(colorName);
  const light = isLightColor(hex);
  return (
    <>
      {photoUrl ? (
        <PhotoThumb url={photoUrl} size={24} />
      ) : (
        <span
          className={`inline-block h-5 w-5 shrink-0 rounded-full ${light ? "ring-1 ring-slate-300" : ""}`}
          style={{ backgroundColor: hex }}
          aria-hidden
        />
      )}
      <span className="truncate">
        <span className="font-medium text-slate-900">{colorName}</span>
        <span className="ml-1.5 text-xs text-slate-500">{sku}</span>
      </span>
    </>
  );
}
