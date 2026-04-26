import Link from "next/link";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@prisma/client";

// Минималистичная навигация: только то, что Алёна реально открывает каждый день.
// Аналитика и админка спрятаны, ОТК-приёмка склада убраны.
const NAV = [
  { href: "/my-tasks", label: "Главный", icon: "✦" },
  { href: "/models", label: "Фасоны", icon: "⬢" },
  { href: "/variants", label: "Цветомодели", icon: "◎" },
  { href: "/orders", label: "Заказы", icon: "⬡" },
  { href: "/packaging", label: "Упаковка", icon: "▯" },
  { href: "/packaging-orders", label: "Заказы упаковки", icon: "▥" },
  { href: "/gantt", label: "Гант", icon: "▤" },
  { href: "/payments", label: "Платежи", icon: "₽" },
];

const MORE_NAV = [
  { href: "/dashboard", label: "Сводка", icon: "◉" },
  { href: "/content-schedule", label: "Артикулы для фотосессии", icon: "✿" },
  { href: "/incoming", label: "Поставки", icon: "▣" },
  { href: "/plan-vs-fact", label: "План/Факт", icon: "⎋" },
  { href: "/factories", label: "Фабрики", icon: "⛭" },
];

const ADMIN_NAV: Array<{ href: string; label: string; icon: string }> = [];

export function Sidebar({ user }: { user: { name?: string | null; email?: string | null; role: Role } }) {
  const isAdmin = user.role === "OWNER" || user.role === "DIRECTOR";

  return (
    <aside className="hidden w-60 flex-shrink-0 border-r border-slate-200 bg-white md:block">
      <div className="flex h-16 items-center border-b border-slate-200 px-5">
        <span className="text-base font-semibold tracking-tight text-slate-900">White One</span>
      </div>
      <nav className="space-y-0.5 px-3 py-4">
        {NAV.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}

        <div className="mt-5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Ещё
        </div>
        {MORE_NAV.map((item) => <NavItem key={item.href} {...item} />)}

        {isAdmin && ADMIN_NAV.length > 0 && (
          <>
            <div className="mt-5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Справочники
            </div>
            {ADMIN_NAV.map((item) => <NavItem key={item.href} {...item} />)}
          </>
        )}
      </nav>
      <div className="absolute bottom-0 w-60 border-t border-slate-200 px-5 py-3">
        <div className="text-sm text-slate-900">{user.name}</div>
        <div className="text-[11px] text-slate-500">{ROLE_LABELS[user.role]}</div>
      </div>
    </aside>
  );
}

function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      <span className="w-4 text-center text-[13px] text-slate-400">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
