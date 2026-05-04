"use client";

import { useEffect, useRef, useState } from "react";
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
        className="flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:border-slate-400"
      >
        {current ? (
          <PackagingRow option={current} />
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <span className="ml-auto text-xs text-slate-400">▼</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
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
        </div>
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
