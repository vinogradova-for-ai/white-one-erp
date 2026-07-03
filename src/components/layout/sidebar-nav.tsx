"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavEntry = { href: string; label: string; icon: string };

// Подсветка активного пункта: выигрывает САМЫЙ ДЛИННЫЙ подходящий префикс,
// чтобы /models/kanban подсвечивал «Канбан фасонов», а не «Фасоны»,
// а провал в /orders/[id] держал подсвеченными «Заказы» (боль Алёны 04.07:
// «провалилась во вкладку, но меню не подсвечивает куда попала»).
export function bestMatch(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const hit = pathname === href || pathname.startsWith(href + "/");
    if (hit && (best === null || href.length > best.length)) best = href;
  }
  return best;
}

export function SidebarNav({
  groups,
}: {
  groups: Array<{ title?: string; items: NavEntry[] }>;
}) {
  const pathname = usePathname();
  const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const active = bestMatch(pathname, allHrefs);

  return (
    <>
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.title && (
            <div className="mt-5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-slate-400">
              {g.title}
            </div>
          )}
          {g.items.map((item) => {
            const isActive = item.href === active;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm ${
                  isActive
                    ? "bg-slate-900 font-medium text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span className={`w-4 text-center text-[13px] ${isActive ? "text-white/80 dark:text-slate-900/70" : "text-slate-400"}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}
