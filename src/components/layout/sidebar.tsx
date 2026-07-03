import { ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@prisma/client";
import { SidebarNav } from "./sidebar-nav";

// Минималистичная навигация: только то, что Алёна реально открывает каждый день.
// Аналитика и админка спрятаны, ОТК-приёмка склада убраны.
// Основной блок — то, чем отдел продукта работает каждый день.
// «Главный» = /dashboard (чек-лист задач по 7 типам, подвкладки по PM).
const NAV = [
  { href: "/dashboard", label: "Главный", icon: "✦" },
  { href: "/models", label: "Фасоны", icon: "⬢" },
  { href: "/models/kanban", label: "Канбан фасонов", icon: "▦" },
  { href: "/models/board", label: "Доска фасонов", icon: "▢" },
  { href: "/models/collection", label: "Раскладка по цветам", icon: "◧" },
  { href: "/variants", label: "Цветомодели", icon: "◎" },
  { href: "/orders", label: "Заказы", icon: "⬡" },
  { href: "/packaging", label: "Упаковка", icon: "▯" },
  { href: "/packaging-orders", label: "Заказы упаковки", icon: "▥" },
  { href: "/gantt-v2", label: "График Ганта", icon: "▦" },
  // «Цели» (/seasons) и «План/Факт» (/plan-vs-fact) убраны из меню (Алёна 04.07:
  // «ненужные вкладки, ориентируемся на Статистику»). Страницы живы по URL,
  // их данные питают Статистику — не удалять.
  { href: "/stats", label: "Статистика", icon: "▤" },
  { href: "/data-gaps", label: "Дыры в данных", icon: "⚠" },
];

// Смежные отделы — разделы, за которыми приходят финансы / склад / ВЭД / контент.
// Они здесь только СМОТРЯТ; работаем в системе мы (отдел продукта).
const MORE_NAV = [
  { href: "/payments", label: "Платежи", icon: "₽" },
  { href: "/shipments", label: "Поставки", icon: "▣" },
  { href: "/incoming", label: "Заказы в пути", icon: "▤" },
  { href: "/warehouse", label: "Склад", icon: "▩" },
  { href: "/content-schedule", label: "Артикулы для фотосессии", icon: "✿" },
];

// Справочники — общие разделы, видны всем сотрудникам.
// Управление людьми (добавить/выключить) внутри «Сотрудников» остаётся за владельцем/руководителем.
const REF_NAV = [
  { href: "/honest-sign", label: "Честный знак", icon: "✓" },
  { href: "/factories", label: "Фабрики", icon: "⛭" },
  { href: "/admin/users", label: "Сотрудники", icon: "☉" },
  { href: "/admin/size-grids", label: "Размерные сетки", icon: "#" },
  { href: "/admin/audit-log", label: "Журнал действий", icon: "≡" },
];

export function Sidebar({ user }: { user: { name?: string | null; email?: string | null; role: Role } }) {
  // Сайдбар — колонка на всю высоту: шапка (фикс) + меню (скроллится) +
  // плашка пользователя (фикс, футер). Раньше плашка была absolute поверх
  // меню и при прокрутке НАКЛАДЫВАЛАСЬ на нижние пункты. Теперь flex-колонка:
  // меню в своей зоне flex-1 overflow-y-auto, футер — отдельным нескроллящимся
  // блоком с фоном и border-t, ничего не перекрывает.
  return (
    <aside className="sticky top-0 hidden h-screen w-60 flex-shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-slate-200 px-5">
        <span className="text-base font-semibold tracking-tight text-slate-900">White One</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <SidebarNav
          groups={[
            { items: NAV },
            { title: "Смежные отделы", items: MORE_NAV },
            { title: "Справочники", items: REF_NAV },
          ]}
        />
      </nav>
      <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3">
        <div className="text-sm text-slate-900">{user.name}</div>
        <div className="text-[11px] text-slate-500">{ROLE_LABELS[user.role]}</div>
      </div>
    </aside>
  );
}

