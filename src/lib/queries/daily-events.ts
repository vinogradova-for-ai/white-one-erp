import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { paymentTargetLabel } from "@/lib/payments/display-name";

// Лента «Что изменилось со вчера» для главного экрана: утром одним взглядом
// видно, что произошло за вчера и сегодня — статусы заказов, оплаты,
// комментарии, образцы. Только чтение, ничего не меняет.

export type DailyEvent = {
  id: string;
  at: Date;
  icon: string;
  text: string;
  href: string;
};

const SAMPLE_STATUS_RU: Record<string, string> = {
  ORDERED: "заказан",
  IN_TRANSIT: "едет",
  RECEIVED: "получен",
  APPROVED: "утверждён",
  REWORK: "на доработку",
};

/** Начало вчерашнего дня по МСК (в UTC). */
function sinceYesterdayMsk(now: Date): Date {
  const msk = new Date(now.getTime() + 3 * 60 * 60_000);
  const startTodayUtc =
    Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate()) -
    3 * 60 * 60_000;
  return new Date(startTodayUtc - 24 * 60 * 60_000);
}

export async function getRecentEvents(now: Date = new Date()): Promise<DailyEvent[]> {
  const since = sinceYesterdayMsk(now);

  const [statusLogs, paidPayments, comments, sampleEvents] = await Promise.all([
    prisma.orderStatusLog.findMany({
      where: { changedAt: { gte: since }, order: { deletedAt: null } },
      include: {
        order: {
          select: { id: true, orderNumber: true, productModel: { select: { name: true } } },
        },
        changedBy: { select: { name: true } },
      },
      orderBy: { changedAt: "desc" },
      take: 40,
    }),
    prisma.payment.findMany({
      where: { status: "PAID", paidAt: { gte: since } },
      include: {
        order: { select: { id: true, orderNumber: true, productModel: { select: { name: true } } } },
        packagingItem: { select: { name: true } },
        packagingOrder: {
          select: {
            orderNumber: true,
            supplierName: true,
            lines: { select: { packagingItem: { select: { name: true } } } },
          },
        },
        paidBy: { select: { name: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 20,
    }),
    prisma.comment.findMany({
      where: { createdAt: { gte: since }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.sample.findMany({
      where: {
        deletedAt: null,
        productModel: { deletedAt: null },
        OR: [
          { createdAt: { gte: since } },
          { receivedDate: { gte: since } },
          { verdictDate: { gte: since } },
        ],
      },
      include: { productModel: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const events: DailyEvent[] = [];

  for (const log of statusLogs) {
    events.push({
      id: `status:${log.id}`,
      at: log.changedAt,
      icon: "⬡",
      text: `${log.order.orderNumber} · ${log.order.productModel.name} → «${ORDER_STATUS_LABELS[log.toStatus]}» (${log.changedBy.name})`,
      href: `/orders/${log.order.id}`,
    });
  }

  for (const p of paidPayments) {
    const target = paymentTargetLabel(p);
    const amount = `${Math.round(Number(p.amount)).toLocaleString("ru-RU")} ${p.currency === "CNY" ? "¥" : "₽"}`;
    events.push({
      id: `paid:${p.id}`,
      at: p.paidAt ?? p.updatedAt,
      icon: "₽",
      text: `Оплачено ${amount} · ${target}${p.paidBy ? ` (${p.paidBy.name})` : ""}`,
      href: p.order ? `/orders/${p.order.id}` : "/payments",
    });
  }

  // Комментарии: подписи сущностей добираем батчами (полиморфная привязка без FK).
  if (comments.length > 0) {
    const authorIds = [...new Set(comments.map((c) => c.authorId))];
    const orderIds = comments.filter((c) => c.entityType === "order").map((c) => c.entityId);
    const modelIds = comments.filter((c) => c.entityType === "model").map((c) => c.entityId);
    const variantIds = comments.filter((c) => c.entityType === "variant").map((c) => c.entityId);
    const [authors, cOrders, cModels, cVariants] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } }),
      orderIds.length
        ? prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true, productModel: { select: { name: true } } },
          })
        : Promise.resolve([]),
      modelIds.length
        ? prisma.productModel.findMany({ where: { id: { in: modelIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      variantIds.length
        ? prisma.productVariant.findMany({
            where: { id: { in: variantIds } },
            select: { id: true, colorName: true, productModel: { select: { name: true } } },
          })
        : Promise.resolve([]),
    ]);
    const authorName = new Map(authors.map((a) => [a.id, a.name]));
    const orderById = new Map(cOrders.map((o) => [o.id, o]));
    const modelById = new Map(cModels.map((m) => [m.id, m]));
    const variantById = new Map(cVariants.map((v) => [v.id, v]));

    for (const c of comments) {
      let label: string | null = null;
      let href = "/models";
      if (c.entityType === "order") {
        const o = orderById.get(c.entityId);
        if (!o) continue;
        label = `${o.orderNumber} · ${o.productModel.name}`;
        href = `/orders/${o.id}`;
      } else if (c.entityType === "model") {
        const m = modelById.get(c.entityId);
        if (!m) continue;
        label = m.name;
        href = `/models/${m.id}`;
      } else if (c.entityType === "variant") {
        const v = variantById.get(c.entityId);
        if (!v) continue;
        label = `${v.productModel.name} · цв. ${v.colorName}`;
        href = `/variants/${c.entityId}`;
      } else {
        continue;
      }
      const snippet = c.body.length > 80 ? `${c.body.slice(0, 80)}…` : c.body;
      events.push({
        id: `comment:${c.id}`,
        at: c.createdAt,
        icon: "💬",
        text: `${authorName.get(c.authorId) ?? "Кто-то"} · ${label}: ${snippet}`,
        href,
      });
    }
  }

  for (const s of sampleEvents) {
    const name = s.label ? `${s.productModel.name} (${s.label})` : s.productModel.name;
    const at = s.verdictDate ?? s.receivedDate ?? s.createdAt;
    if (at < since) continue;
    events.push({
      id: `sample:${s.id}:${s.status}`,
      at,
      icon: "🧵",
      text: `Образец ${SAMPLE_STATUS_RU[s.status] ?? s.status} · ${name}${s.status === "REWORK" && s.verdictNote ? ` — ${s.verdictNote.slice(0, 60)}` : ""}`,
      href: `/models/${s.productModel.id}`,
    });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return events.slice(0, 50);
}
