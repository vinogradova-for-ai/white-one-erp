import Link from "next/link";

// Минималистичный нижний таб-бар: 5 ключевых направлений.
// Все «Ещё» — сводка/админ/настройки — за вкладкой «Ещё» (на /dashboard).
const TABS = [
  { href: "/my-tasks", label: "Задачи", icon: "✦" },
  { href: "/models", label: "Каталог", icon: "⬢" },
  { href: "/orders", label: "Заказы", icon: "⬡" },
  { href: "/packaging", label: "Упаковка", icon: "▯" },
  { href: "/dashboard", label: "Ещё", icon: "◉" },
];

export function MobileNav() {
  return (
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
      </div>
    </nav>
  );
}
