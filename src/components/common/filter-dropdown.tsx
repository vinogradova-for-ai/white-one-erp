"use client";

import { useRef, useState } from "react";

/** Ширины панели в px — нужны, чтобы прижать fixed-панель к краю экрана. */
const PANEL_WIDTH_PX: Record<string, number> = { "w-56": 224, "w-64": 256 };

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
  // Панель рендерится fixed по координатам кнопки: absolute-вариант обрезался
  // лентами с overflow-x-auto (мобильные фильтры /orders — скрин Алёны 22.07).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const openPanel = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const w = PANEL_WIDTH_PX[widthClass] ?? 224;
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) });
    }
    setOpen(true);
  };
  const active = value.length > 0;
  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={`flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium whitespace-nowrap transition md:h-auto md:py-1.5 ${
          active
            ? "border-slate-900 bg-slate-900 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        {label}
        {active && <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{value.length}</span>}
        <span className="text-[10px]">▾</span>
      </button>
      {open && pos && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            style={{ top: pos.top, left: pos.left }}
            className={`fixed z-40 max-h-72 max-w-[calc(100vw-1rem)] ${widthClass} overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg`}
          >
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-400">Нет вариантов</div>
            )}
            {options.map((o) => {
              const checked = value.includes(o.value);
              return (
                <label
                  key={o.value}
                  className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    className="h-4 w-4 shrink-0"
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
