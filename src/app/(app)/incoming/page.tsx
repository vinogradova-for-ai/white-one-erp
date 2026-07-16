import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Prisma, type Role } from "@prisma/client";
import { formatDate } from "@/lib/format";
import { DELIVERY_METHOD_LABELS } from "@/lib/constants";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { IncomingExportButton } from "./export-button";
import { IncomingOrdersList, type IncomingOrderItem } from "@/components/incoming/incoming-orders-list";

/**
 * Окно для логистики (Таня).
 * Заказы в пути и к отгрузке. БЕЗ финансов.
 * П4 UX-аудита: дефолт — только едущие; прибывшие на склад — за свёрткой.
 * §4 UX-аудита: чекбоксы + «Собрать поставку из выбранных» (право shipment.manage).
 */

const INCOMING_INCLUDE = {
  productModel: { select: { name: true, photoUrls: true } },
  lines: {
    select: {
      quantity: true,
      quantityActual: true,
      productVariant: { select: { sku: true, colorName: true, photoUrls: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  factory: { select: { name: true, country: true } },
} satisfies Prisma.OrderInclude;

type IncomingOrder = Prisma.OrderGetPayload<{ include: typeof INCOMING_INCLUDE }>;

// В Поставки уходит ФАКТ количества (фабрика могла накроить больше/меньше).
// Если факт по линии не проставлен — используем план как fallback и помечаем.
function lineQty(l: { quantity: number; quantityActual: number | null }): number {
  return l.quantityActual ?? l.quantity;
}

function serialize(o: IncomingOrder): IncomingOrderItem {
  const firstLine = o.lines[0];
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    modelName: o.productModel.name,
    variantPhotoUrl: firstLine?.productVariant.photoUrls[0] ?? null,
    modelPhotoUrl: o.productModel.photoUrls[0] ?? null,
    firstColorName: firstLine?.productVariant.colorName ?? null,
    colorNames: o.lines.map((l) => l.productVariant.colorName),
    totalQty: o.lines.reduce((a, l) => a + lineQty(l), 0),
    hasFact: o.lines.some((l) => l.quantityActual !== null),
    factoryName: o.factory?.name ?? null,
    factoryCountry: o.factory?.country ?? null,
    deliveryMethodLabel: o.deliveryMethod ? DELIVERY_METHOD_LABELS[o.deliveryMethod] : null,
    status: o.status,
    arrivalPlanned: formatDate(o.arrivalPlannedDate),
    arrivalActual: formatDate(o.arrivalActualDate),
  };
}

export default async function IncomingPage() {
  const session = await auth();
  const role = (session?.user as { role?: Role } | undefined)?.role;
  // Сборка поставок — тем, кто ими управляет (PM + Настя + админы). Логистика смотрит.
  const canBuildShipment = role ? can(role, "shipment.manage") : false;

  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: { in: ["IN_TRANSIT", "WAREHOUSE_MSK"] },
    },
    include: INCOMING_INCLUDE,
    orderBy: { arrivalPlannedDate: "asc" },
  });

  const riding = orders.filter((o) => o.status !== "WAREHOUSE_MSK").map(serialize);
  const arrived = orders.filter((o) => o.status === "WAREHOUSE_MSK").map(serialize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          {/* Не «Поставки» — так называется /shipments (сборные поставки-партии).
              Это окно — все заказы в пути и к отгрузке, называем как в меню. */}
          <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Заказы в пути</h1>
          <p className="text-sm text-slate-500">
            В пути и к отгрузке: {riding.length}
            {arrived.length > 0 && ` · прибыло: ${arrived.length} (свёрнуто ниже)`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <IncomingExportButton />
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
            <span className="flex h-9 items-center rounded-md bg-white px-3 text-sm font-medium text-slate-900 shadow-sm">Таблица</span>
            <Link href="/incoming/calendar" className="flex h-9 items-center rounded-md px-3 text-sm text-slate-600 hover:bg-white">Календарь</Link>
          </div>
        </div>
      </div>

      <IncomingOrdersList
        orders={riding}
        emptyText="Пока ничего не едет. Будет что-то на отгрузке — появится здесь."
        selectable={canBuildShipment}
      />

      {arrived.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <span className="text-slate-400 transition group-open:rotate-90">▸</span>
            Прибыло на склад Москва
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-600">
              {arrived.length}
            </span>
          </summary>
          <div className="mt-3">
            <IncomingOrdersList orders={arrived} emptyText="" selectable={false} />
          </div>
        </details>
      )}
    </div>
  );
}
