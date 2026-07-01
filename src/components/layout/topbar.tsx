"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { User } from "lucide-react";
import type { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/constants";
import { ThemeToggle } from "@/components/common/theme-toggle";

// Инициалы для аватара на мобиле (первые буквы имени).
function initials(name?: string | null) {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function Topbar({ user }: { user: { name?: string | null; email?: string | null; role: Role } }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-8">
      <div className="flex items-center gap-3 md:hidden">
        <span className="text-lg font-semibold text-slate-900">White One</span>
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-2 md:gap-3">
        {/* Десктоп: имя + роль текстом ведут в профиль */}
        <Link href="/profile" className="hidden text-right md:block" title="Профиль и смена пароля">
          <div className="text-sm font-medium text-slate-900">{user.name}</div>
          <div className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</div>
        </Link>
        {/* Мобайл: аватар-инициалы ведут в профиль (раньше блок имени был скрыт) */}
        <Link
          href="/profile"
          aria-label="Профиль и смена пароля"
          title="Профиль"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 active:bg-slate-100 md:hidden"
        >
          {initials(user.name) || <User className="h-5 w-5" />}
        </Link>
        <ThemeToggle />
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100"
        >
          Выйти
        </button>
      </div>
    </header>
  );
}
