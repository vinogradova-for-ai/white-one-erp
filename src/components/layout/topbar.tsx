"use client";

import { signOut } from "next-auth/react";
import type { Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/constants";

export function Topbar({ user }: { user: { name?: string | null; email?: string | null; role: Role } }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-8">
      <div className="flex items-center gap-3 md:hidden">
        <span className="text-lg font-semibold text-slate-900">White One</span>
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-3">
        <div className="hidden text-right md:block">
          <div className="text-sm font-medium text-slate-900">{user.name}</div>
          <div className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Выйти
        </button>
      </div>
    </header>
  );
}
