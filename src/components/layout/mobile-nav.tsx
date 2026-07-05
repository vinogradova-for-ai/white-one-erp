"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { bestMatch } from "./sidebar-nav";

// Нижний таб-бар: 4 ключевых направления + кнопка «Ещё».
// В табе — «Гант» (Алёна 05.07: команда с телефона живёт в графике).
// «Статистика» уехала в «Ещё». Страницы живы по URL.
const TABS = [
  { href: "/dashboard", label: "Главный", icon: "✦" },
  { href: "/gantt-v2", label: "Гант", icon: "▦" },
  { href: "/orders", label: "Заказы", icon: "⬡" },
  { href: "/models", label: "Каталог", icon: "⬢" },
];

const MORE_LINKS = [
  { href: "/stats", label: "Статистика", icon: "▤" },
  { href: "/packaging", label: "Упаковка", icon: "▯" },
  { href: "/variants", label: "Цветомодели", icon: "◎" },
  { href: "/packaging-orders", label: "Заказы упаковки", icon: "▥" },
  { href: "/data-gaps", label: "Дыры в данных", icon: "⚠" },
  { href: "/payments", label: "Платежи", icon: "₽" },
  { href: "/shipments", label: "Карго", icon: "▣" },
  { href: "/incoming", label: "Заказы в пути", icon: "▤" },
  { href: "/warehouse", label: "Склад", icon: "▩" },
  { href: "/content-schedule", label: "Артикулы для фотосессии", icon: "✿" },
  { href: "/honest-sign", label: "Честный знак", icon: "✓" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Подсветка активного таба по самому длинному совпавшему префиксу
  // (включая «Ещё»-ссылки: провал в /payments не должен подсвечивать таб).
  const active = bestMatch(pathname, [...TABS, ...MORE_LINKS].map((t) => t.href));

  return (
    <>
      <nav className="pb-safe fixed right-0 bottom-0 left-0 z-50 border-t border-slate-200 bg-white md:hidden">
        <div className="grid grid-cols-5 gap-0.5">
          {TABS.map((tab) => {
            const isActive = tab.href === active;
            return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-center text-xs active:bg-slate-100 ${
                isActive ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-500"
              }`}
            >
              <span className={`text-lg leading-none ${isActive ? "" : "opacity-60"}`}>{tab.icon}</span>
              <span className="text-[11px] leading-tight">{tab.label}</span>
              <span className={`h-0.5 w-6 rounded-full ${isActive ? "bg-slate-900 dark:bg-slate-100" : "bg-transparent"}`} />
            </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-center text-xs text-slate-700 active:bg-slate-100"
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
            className="pb-safe-4 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white pt-2 shadow-xl"
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
                    className="flex min-h-[52px] items-center gap-3 px-5 py-3 text-sm text-slate-800 active:bg-slate-100"
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
