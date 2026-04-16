import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ROLE_LABELS } from "@/lib/constants";

export default async function UsersAdminPage() {
  const session = await auth();
  if (!session || (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR")) {
    redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Пользователи</h1>
        <p className="text-sm text-slate-500">Всего: {users.length}</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Имя</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Email</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Роль</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Статус</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Telegram</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2 text-xs text-slate-600">{u.email}</td>
                <td className="px-3 py-2 text-xs">{ROLE_LABELS[u.role]}</td>
                <td className="px-3 py-2 text-xs">
                  {u.isActive ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">Активен</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500">Отключён</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {u.telegramChatId ? "✓ привязан" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Создание/редактирование пользователей появится в следующих итерациях. Пока — через `prisma studio` (npm run db:studio).
      </p>
    </div>
  );
}
