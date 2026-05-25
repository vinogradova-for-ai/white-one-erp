import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { AuditAction } from "@prisma/client";

const ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: "Создал",
  UPDATE: "Изменил",
  DELETE: "Удалил",
  STATUS_CHANGE: "Сменил статус",
  IMPORT: "Импорт",
  EXPORT: "Экспорт",
};

const ENTITY_LABEL: Record<string, string> = {
  Order: "Заказ",
  ProductModel: "Фасон",
  ProductVariant: "Цветомодель",
  Payment: "Платёж",
  PackagingOrder: "Заказ упаковки",
  PackagingItem: "Упаковка",
  Factory: "Фабрика",
  User: "Сотрудник",
  MonthlyPlan: "План",
  SizeGrid: "Размерная сетка",
};

const ENTITY_URL: Record<string, (id: string) => string> = {
  Order: (id) => `/orders/${id}`,
  ProductModel: (id) => `/models/${id}`,
  ProductVariant: (id) => `/variants/${id}`,
  PackagingItem: (id) => `/packaging/${id}`,
  PackagingOrder: (id) => `/packaging-orders/${id}`,
};

const PAGE_SIZE = 100;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; user?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
    redirect("/");
  }

  const sp = await searchParams;
  const entityFilter = sp.entity ?? "";
  const userFilter = sp.user ?? "";
  const page = Math.max(1, Number(sp.page ?? 1));

  const where = {
    ...(entityFilter ? { entityType: entityFilter } : {}),
    ...(userFilter ? { userId: userFilter } : {}),
  };

  const [logs, total, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const entityTypes = Object.keys(ENTITY_LABEL);

  function paramsWith(patch: Record<string, string | null>): string {
    const p = new URLSearchParams();
    if (entityFilter && patch.entity === undefined) p.set("entity", entityFilter);
    if (userFilter && patch.user === undefined) p.set("user", userFilter);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Журнал действий</h1>
        <p className="text-sm text-slate-500">
          Кто что когда менял. Всего записей: {total.toLocaleString("ru-RU")}.
          Видит только OWNER и DIRECTOR.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-slate-500 self-center">Сущность:</span>
        <Link
          href={`/admin/audit-log${paramsWith({ entity: null, page: null })}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            !entityFilter ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          Все
        </Link>
        {entityTypes.map((t) => (
          <Link
            key={t}
            href={`/admin/audit-log${paramsWith({ entity: t, page: null })}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              entityFilter === t ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            {ENTITY_LABEL[t]}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-slate-500 self-center">Сотрудник:</span>
        <Link
          href={`/admin/audit-log${paramsWith({ user: null, page: null })}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            !userFilter ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"
          }`}
        >
          Все
        </Link>
        {users.map((u) => (
          <Link
            key={u.id}
            href={`/admin/audit-log${paramsWith({ user: u.id, page: null })}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              userFilter === u.id ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            {u.name}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Когда</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Кто</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Действие</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Сущность</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => {
              const urlFn = ENTITY_URL[l.entityType];
              const url = urlFn ? urlFn(l.entityId) : null;
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {formatDateTime(l.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {l.user?.name ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{ACTION_LABEL[l.action]}</td>
                  <td className="px-3 py-2">
                    <span className="text-slate-500">{ENTITY_LABEL[l.entityType] ?? l.entityType}</span>{" "}
                    {url ? (
                      <Link href={url} className="font-mono text-xs text-slate-700 hover:underline">
                        #{l.entityId.slice(-6)}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-slate-400">#{l.entityId.slice(-6)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="p-12 text-center text-sm text-slate-500">
                  По выбранным фильтрам ничего нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/audit-log${paramsWith({ page: String(page - 1) })}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              ← Предыдущая
            </Link>
          ) : <span />}
          <span className="text-slate-500">
            Стр. {page} из {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/admin/audit-log${paramsWith({ page: String(page + 1) })}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              Следующая →
            </Link>
          ) : <span />}
        </div>
      )}
    </div>
  );
}
