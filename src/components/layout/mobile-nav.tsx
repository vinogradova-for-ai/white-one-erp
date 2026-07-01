"use client";

import Link from "next/link";
import { useState } from "react";

// Нижний таб-бар: 4 ключевых направления + кнопка «Ещё».
// «Цели» вынесена в таб (Алёна 27.05.2026): это экран руководителя, открывается
// каждый день. «Упаковка» переехала в «Ещё» — операционная задача, открывается
// через дашборд при необходимости.
const TABS = [
  { href: "/dashboard", label: "Главный", icon: "✦" },
  { href: "/seasons", label: "Цели", icon: "◈" },
  { href: "/orders", label: "Заказы", icon: "⬡" },
  { href: "/models", label: "Каталог", icon: "⬢" },
];

const MORE_LINKS = [
  { href: "/packaging", label: "Упаковка", icon: "▯" },
  { href: "/variants", label: "Цветомодели", icon: "◎" },
  { href: "/packaging-orders", label: "Заказы упаковки", icon: "▥" },
  { href: "/gantt-v2", label: "График Ганта", icon: "▦" },
  { href: "/plan-vs-fact", label: "План / Факт", icon: "⎋" },
  { href: "/payments", label: "Платежи", icon: "₽" },
  { href: "/incoming", label: "Поставки", icon: "▣" },
  { href: "/warehouse", label: "Склад", icon: "▩" },
  { href: "/content-schedule", label: "Артикулы для фотосессии", icon: "✿" },
  { href: "/honest-sign", label: "Честный знак", icon: "✓" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="fixed right-0 bottom-0 left-0 z-50 border-t border-slate-200 bg-white md:hidden">
        <div className="grid grid-cols-5 gap-0.5">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-0.5 py-2 text-center text-xs text-slate-700 active:bg-slate-100"
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="text-[11px] leading-tight">{tab.label}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2 text-center text-xs text-slate-700 active:bg-slate-100"
          >
            <span className="text-lg leading-none">◉</span>
            <span className="text-[11px] leading-tight">Ещё</span>
          </button>
        </div>
      </nav>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="rounded-t-2xl bg-white pt-2 pb-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-slate-300" />
            <div className="px-4 pb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              Все разделы
            </div>
            <ul className="divide-y divide-slate-100">
              {MORE_LINKS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-5 py-3 text-sm text-slate-800 active:bg-slate-100"
                  >
                    <span className="w-5 text-center text-base text-slate-400">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
