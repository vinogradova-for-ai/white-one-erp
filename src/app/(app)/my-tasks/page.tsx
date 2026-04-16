import Link from "next/link";
import { auth } from "@/lib/auth";
import { getMyTasks } from "@/lib/queries/my-tasks";
import { formatDate } from "@/lib/format";
import { PhotoThumb } from "@/components/common/photo-thumb";

export default async function MyTasksPage() {
  const session = await auth();
  if (!session?.user) return null;

  const tasks = await getMyTasks(session.user.id, session.user.role);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Мои задачи</h1>
        <p className="text-sm text-slate-500">{tasks.length} активных</p>
      </div>

      {tasks.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-500">Задач нет — отличная работа ✓</p>
        </div>
      )}

      <div className="space-y-2">
        {tasks.map((t) => {
          const urgencyClass = t.isDelayed
            ? "border-red-300 bg-red-50"
            : t.urgencyDays !== null && t.urgencyDays <= 3
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-white";
          const typeLabel = t.type === "model" ? "Фасон" : t.type === "order" ? "Заказ" : "Образец";
          return (
            <Link
              key={`${t.type}-${t.id}`}
              href={t.url}
              className={`flex gap-3 rounded-2xl border p-4 transition hover:shadow-sm ${urgencyClass}`}
            >
              <PhotoThumb url={t.photoUrl} size={56} />
              <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{typeLabel}</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {t.statusLabel}
                    </span>
                  </div>
                  <div className="mt-1 font-medium text-slate-900 line-clamp-1">{t.title}</div>
                  <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">{t.subtitle}</div>
                </div>
                <div className="text-right">
                  {t.deadline ? (
                    <>
                      <div className="text-xs text-slate-500">Дедлайн</div>
                      <div className={`text-sm font-medium ${t.isDelayed ? "text-red-700" : "text-slate-900"}`}>
                        {formatDate(t.deadline)}
                      </div>
                      {t.urgencyDays !== null && (
                        <div className={`text-xs ${t.isDelayed ? "text-red-600" : "text-slate-500"}`}>
                          {t.urgencyDays < 0
                            ? `Просрочено на ${Math.abs(t.urgencyDays)} дн.`
                            : t.urgencyDays === 0 ? "Сегодня" : `Через ${t.urgencyDays} дн.`}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">без срока</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
