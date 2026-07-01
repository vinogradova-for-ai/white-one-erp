import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UserToggleButton } from "./toggle-button";
import { AddUserForm } from "./add-user-form";
import { RoleCell } from "./role-cell";
import { ResetPasswordButton } from "./reset-password-button";

// Список сотрудников виден всем (прозрачность команды).
// Добавлять/выключать людей может только владелец/руководитель.
export default async function UsersAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const isAdmin = session.user.role === "OWNER" || session.user.role === "DIRECTOR";
  const isOwner = session.user.role === "OWNER";
  const meId = session.user.id;

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Сотрудники</h1>
          <p className="text-sm text-slate-500">
            Активных: {activeCount} из {users.length}. Только активные видны в выпадающих «Ответственный».
          </p>
        </div>
        {isAdmin && <AddUserForm />}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Имя</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Логин</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Роль</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className={u.isActive ? "" : "bg-slate-50 text-slate-400"}>
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2 text-slate-600">{u.email}</td>
                <td className="px-3 py-2">
                  <RoleCell
                    userId={u.id}
                    role={u.role}
                    canEdit={isAdmin && u.id !== meId}
                    actorIsOwner={isOwner}
                  />
                </td>
                <td className="px-3 py-2">
                  {u.isActive ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">активен</span>
                  ) : (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">отключён</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                  {isAdmin && <ResetPasswordButton userId={u.id} userName={u.name} />}
                  {isAdmin && <UserToggleButton userId={u.id} isActive={u.isActive} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
