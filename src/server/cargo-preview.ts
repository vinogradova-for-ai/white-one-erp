import { prisma } from "@/lib/prisma";

/**
 * Человеческое превью содержимого карго для списка и графика (Алёна 16.07):
 * «в превью непонятно, что внутри едет» — собираем по каждому карго строки
 * содержимого: фото + артикул/название + штук. Если ничего не прицеплено,
 * падаем на текст из Excel-переноса (comment) — хоть что-то человеческое.
 */

export type CargoPreviewItem = {
  photoUrl: string | null;
  label: string;      // артикул фасона или название упаковки
  qty: number | null; // штук
};

export type CargoPreview = {
  items: CargoPreviewItem[];  // до 4 позиций
  moreCount: number;          // сколько ещё позиций не показали
  title: string;              // человеческая подпись карго («Брюки бочки · 4331 шт» / текст из Excel)
};

type ShipmentForPreview = {
  comment: string | null;
  batches: Array<{
    items: Array<{ plannedQty: number }>;
    order: {
      productModel: { name: string; artikulBase: string | null; photoUrls: string[] };
    };
  }>;
  packagingOrders: Array<{
    lines: Array<{
      quantity: number;
      packagingItem: { name: string; photoUrl: string | null };
    }>;
  }>;
};

/** include-фрагмент для prisma-запроса списка карго под превью. */
export const CARGO_PREVIEW_INCLUDE = {
  batches: {
    select: {
      items: { select: { plannedQty: true } },
      order: {
        select: {
          productModel: { select: { name: true, artikulBase: true, photoUrls: true } },
        },
      },
    },
  },
  packagingOrders: {
    select: {
      lines: {
        select: {
          quantity: true,
          packagingItem: { select: { name: true, photoUrl: true } },
        },
      },
    },
  },
} as const;

export function buildCargoPreview(s: ShipmentForPreview): CargoPreview {
  const items: CargoPreviewItem[] = [];

  for (const b of s.batches) {
    const qty = b.items.reduce((a, i) => a + i.plannedQty, 0);
    const m = b.order.productModel;
    items.push({
      photoUrl: m.photoUrls[0] ?? null,
      label: m.artikulBase || m.name,
      qty: qty > 0 ? qty : null,
    });
  }
  for (const p of s.packagingOrders) {
    for (const l of p.lines) {
      items.push({
        photoUrl: l.packagingItem.photoUrl,
        label: l.packagingItem.name,
        qty: l.quantity > 0 ? l.quantity : null,
      });
    }
  }

  const shown = items.slice(0, 4);
  const moreCount = Math.max(0, items.length - shown.length);

  let title: string;
  if (items.length > 0) {
    const first = items[0];
    title = first.qty != null ? `${first.label} · ${fmtQty(first.qty)} шт` : first.label;
    if (items.length > 1) title += ` +${items.length - 1}`;
  } else if (s.comment) {
    // Перенос из Excel: наименования лежат в комментарии
    title = s.comment.length > 60 ? s.comment.slice(0, 57) + "…" : s.comment;
  } else {
    title = "пустое карго";
  }

  return { items: shown, moreCount, title };
}

function fmtQty(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** Загрузка карго со всем нужным для списка/графика. */
export async function loadShipmentsWithPreview() {
  const shipments = await prisma.shipment.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: {
      createdBy: { select: { name: true } },
      ...CARGO_PREVIEW_INCLUDE,
    },
  });
  return shipments.map((s) => ({ ...s, preview: buildCargoPreview(s) }));
}
