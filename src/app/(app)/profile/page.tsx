import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@prisma/client";
import { ChangePasswordForm } from "./change-password-form";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user as { name?: string | null; email?: string | null; role: Role };

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Профиль</h1>
        <p className="text-sm text-slate-500">
          {user.name} · {ROLE_LABELS[user.role]} · логин <code className="rounded bg-slate-100 px-1">{user.email}</code>
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Сменить пароль</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
