import Link from "next/link";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@prisma/client";

const NAV = [
  { href: "/dashboard", label: "Сводка", icon: "◉" },
  { href: "/my-tasks", label: "Мои задачи", icon: "✦" },
  { href: "/models", label: "Фасоны", icon: "⬢" },
  { href: "/variants", label: "Варианты", icon: "◎" },
  { href: "/orders", label: "Заказы", icon: "⬡" },
  { href: "/samples", label: "Образцы", icon: "◈" },
  { href: "/ideas", label: "Идеи", icon: "✎" },
];

const DEPT_NAV = [
  { href: "/content-schedule", label: "Фото-график", icon: "📷" },
  { href: "/incoming", label: "Поставки", icon: "▣" },
  { href: "/customs", label: "ВЭД", icon: "⊞" },
  { href: "/warehouse-receipt", label: "Приёмка склада", icon: "⌂" },
];

const ANALYTICS_NAV = [
  { href: "/plan-vs-fact", label: "План/Факт", icon: "⎋" },
  { href: "/factory-load", label: "Загрузка фабрик", icon: "⚙" },
];

const ADMIN_NAV = [
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
          <NavItem key={item.href} {...item} />
        ))}

        <div className="mt-6 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Смежные отделы
        </div>
        {DEPT_NAV.map((item) => <NavItem key={item.href} {...item} />)}

        <div className="mt-6 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Аналитика
        </div>
        {ANALYTICS_NAV.map((item) => <NavItem key={item.href} {...item} />)}

        {isAdmin && (
          <>
            <div className="mt-6 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Админ
            </div>
            {ADMIN_NAV.map((item) => <NavItem key={item.href} {...item} />)}
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

function NavItem({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
    >
      <span className="w-5 text-center text-slate-400">{icon}</span>
      <span>{label}</span>
    </Link>
  );
}
