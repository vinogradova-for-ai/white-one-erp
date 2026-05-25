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

// Человеческие имена полей. Все вместе — чтобы не разбивать на enity-словари.
const FIELD_LABEL: Record<string, string> = {
  // Order
  orderNumber: "номер",
  orderType: "тип заказа",
  season: "сезон",
  launchMonth: "месяц запуска",
  factoryId: "фабрика",
  ownerId: "ответственный",
  deliveryMethod: "способ доставки",
  paymentTerms: "условия оплаты",
  decisionDate: "дата решения",
  handedToFactoryDate: "передан фабрике",
  sewingStartDate: "старт пошива",
  readyAtFactoryDate: "готов на фабрике",
  qcDate: "ОТК",
  shipmentDate: "отгрузка",
  arrivalPlannedDate: "прибытие (план)",
  arrivalActualDate: "прибытие (факт)",
  packingDoneDate: "упакован",
  wbShipmentDate: "отгрузка на WB",
  saleStartDate: "старт продаж",
  packagingType: "тип упаковки",
  packagingOrdered: "упаковка заказана",
  isDelayed: "флаг задержки",
  hasIssue: "флаг проблемы",
  wbCardReady: "карточка WB готова",
  status: "статус",
  payments: "график платежей",
  notes: "заметки",
  // ProductModel
  name: "название",
  brand: "бренд",
  category: "категория",
  subcategory: "подкатегория",
  sizeGridId: "размерная сетка",
  countryOfOrigin: "страна",
  preferredFactoryId: "фабрика по умолчанию",
  fabricName: "ткань",
  fabricComposition: "состав ткани",
  purchasePriceRub: "себестоимость ₽",
  purchasePriceCny: "себестоимость ¥",
  cnyRubRate: "курс ¥/₽",
  targetCostRub: "таргет ₽",
  targetCostCny: "таргет ¥",
  patternsUrl: "ссылка на материалы",
  photoUrls: "фото",
  // ProductVariant
  sku: "SKU",
  colorName: "цвет",
  fabricColorCode: "код цвета ткани",
  // Доп. поля заказа
  lines: "позиции",
  quantity: "количество",
  quantityActual: "факт количества",
};

function summarizeChanges(changes: unknown): string {
  if (!changes || typeof changes !== "object") return "";
  const keys = Object.keys(changes as Record<string, unknown>);
  if (keys.length === 0) return "";
  const labels = keys.map((k) => FIELD_LABEL[k] ?? k);
  // Показываем до 4 полей, остальное скрываем.
  if (labels.length <= 4) return labels.join(", ");
  return `${labels.slice(0, 4).join(", ")} +ещё ${labels.length - 4}`;
}

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

  // Резолвим entityId → читаемое имя одним батчем по типу сущности.
  const orderIds = new Set<string>();
  const modelIds = new Set<string>();
  const variantIds = new Set<string>();
  for (const l of logs) {
    if (l.entityType === "Order") orderIds.add(l.entityId);
    else if (l.entityType === "ProductModel") modelIds.add(l.entityId);
    else if (l.entityType === "ProductVariant") variantIds.add(l.entityId);
  }

  const [orders, models, variants] = await Promise.all([
    orderIds.size > 0
      ? prisma.order.findMany({
          where: { id: { in: [...orderIds] } },
          select: { id: true, orderNumber: true, productModel: { select: { name: true } } },
        })
      : Promise.resolve([]),
    modelIds.size > 0
      ? prisma.productModel.findMany({
          where: { id: { in: [...modelIds] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    variantIds.size > 0
      ? prisma.productVariant.findMany({
          where: { id: { in: [...variantIds] } },
          select: { id: true, sku: true, colorName: true, productModel: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const modelMap = new Map(models.map((m) => [m.id, m]));
  const variantMap = new Map(variants.map((v) => [v.id, v]));

  function resolveName(entityType: string, entityId: string): string {
    if (entityType === "Order") {
      const o = orderMap.get(entityId);
      return o ? `${o.orderNumber} · ${o.productModel.name}` : "—";
    }
    if (entityType === "ProductModel") return modelMap.get(entityId)?.name ?? "—";
    if (entityType === "ProductVariant") {
      const v = variantMap.get(entityId);
      return v ? `${v.productModel.name} · ${v.colorName}` : "—";
    }
    return entityId.slice(-8);
  }

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
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500 w-36">Когда</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500 w-24">Кто</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500 w-32">Действие</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Что</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500">Что изменилось</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((l) => {
              const urlFn = ENTITY_URL[l.entityType];
              const url = urlFn ? urlFn(l.entityId) : null;
              const name = resolveName(l.entityType, l.entityId);
              const summary = summarizeChanges(l.changes);
              return (
                <tr key={l.id}>
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                    {formatDateTime(l.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                    {l.user?.name ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{ACTION_LABEL[l.action]}</td>
                  <td className="px-3 py-2">
                    <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1.5">
                      {ENTITY_LABEL[l.entityType] ?? l.entityType}
                    </span>
                    {url ? (
                      <Link href={url} className="text-sm text-slate-900 hover:underline">
                        {name}
                      </Link>
                    ) : (
                      <span className="text-sm text-slate-700">{name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {summary || <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-sm text-slate-500">
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
