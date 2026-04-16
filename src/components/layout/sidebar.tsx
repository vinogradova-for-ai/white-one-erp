import Link from "next/link";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@prisma/client";

const NAV = [
  { href: "/dashboard", label: "Сводка", icon: "◉" },
  { href: "/my-tasks", label: "Мои задачи", icon: "✦" },
  { href: "/products", label: "Каталог", icon: "⬢" },
  { href: "/orders", label: "Заказы", icon: "⬡" },
  { href: "/deliveries", label: "Поставки", icon: "▣" },
  { href: "/packing", label: "Упаковка", icon: "◈" },
  { href: "/payments", label: "Платежи", icon: "₽" },
  { href: "/plan-vs-fact", label: "План/Факт", icon: "⎋" },
  { href: "/hits", label: "Хиты", icon: "★" },
  { href: "/factory-load", label: "Фабрики", icon: "⚙" },
  { href: "/funnel", label: "Воронка новинок", icon: "▼" },
];

const ADMIN_NAV = [
  { href: "/admin/import", label: "Импорт Excel", icon: "↧" },
  { href: "/admin/users", label: "Пользователи", icon: "◐" },
];

export function Sidebar({ user }: { user: { name?: string | null; email?: string | null; role: Role } }) {
  const isAdmin = user.role === "OWNER" || user.role === "DIRECTOR";

  return (
    <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white md:block">
      <div className="flex h-16 items-center border-b border-slate-200 px-6">
        <span className="text-lg font-semibold text-slate-900">White One</span>
      </div>
      <nav className="space-y-1 p-4">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <span className="w-5 text-center text-slate-400">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
        {isAdmin && (
          <>
            <div className="mt-6 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Администрирование
            </div>
            {ADMIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                <span className="w-5 text-center text-slate-400">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>
      <div className="absolute bottom-0 w-64 border-t border-slate-200 p-4">
        <div className="text-sm font-medium text-slate-900">{user.name}</div>
        <div className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</div>
      </div>
    </aside>
  );
}
