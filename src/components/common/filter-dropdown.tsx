"use client";

import { useState } from "react";

/**
 * Мульти-выбор фильтра — кастомный dropdown с чекбоксами.
 * Один и тот же UX используется на Ганте v2 и в списках (например, /orders),
 * чтобы фильтры везде выглядели и работали одинаково.
 */
export function FilterDropdown({
  label,
  options,
  value,
  onChange,
  widthClass = "w-56",
}: {
  label: string;
  options: Array<{ value: string; label: string; count?: number; color?: string }>;
  value: string[];
  onChange: (v: string[]) => void;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = value.length > 0;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          active
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {label}
        {active && <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{value.length}</span>}
        <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 top-full z-40 mt-1 max-h-64 ${widthClass} overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg`}>
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400">Нет вариантов</div>
            )}
            {options.map((o) => {
              const checked = value.includes(o.value);
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      onChange(checked ? value.filter((v) => v !== o.value) : [...value, o.value]);
                    }}
                  />
                  {o.color && <span className={`inline-block h-2 w-2 rounded-full ${o.color}`} />}
                  <span className="flex-1">{o.label}</span>
                  {typeof o.count === "number" && (
                    <span className="text-[10px] text-slate-400">{o.count}</span>
                  )}
                </label>
              );
            })}
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mt-1 w-full rounded px-2 py-1 text-left text-[11px] text-slate-500 hover:bg-slate-100"
              >
                Сбросить
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
