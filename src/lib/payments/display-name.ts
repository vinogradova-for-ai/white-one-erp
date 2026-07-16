// Единая подпись «за что платим» для платежа (П2 UX-аудита).
// Раньше платежи упаковки подписывались «упаковка»/«—» — не понять,
// какой из трёх платежей по коробкам оплачен. Теперь везде:
// «PKG-2026-0004 · Коробка белая · Иванов» (что есть — то и показываем).

export type PaymentNameSource = {
  type: "ORDER" | "PACKAGING";
  label: string;
  supplierName?: string | null;
  order?: { orderNumber: string; productModel: { name: string } } | null;
  packagingItem?: { name: string } | null;
  packagingOrder?: {
    orderNumber: string;
    supplierName?: string | null;
    lines?: Array<{ packagingItem: { name: string } }>;
  } | null;
};

export function paymentTargetLabel(p: PaymentNameSource): string {
  if (p.type === "ORDER") {
    if (p.order) return `${p.order.orderNumber} · ${p.order.productModel.name}`;
    return p.label;
  }
  const parts: string[] = [];
  if (p.packagingOrder) parts.push(p.packagingOrder.orderNumber);
  const item =
    p.packagingItem?.name ??
    p.packagingOrder?.lines?.map((l) => l.packagingItem.name).join(", ");
  if (item) parts.push(item);
  const supplier = p.supplierName ?? p.packagingOrder?.supplierName;
  if (supplier) parts.push(supplier);
  if (parts.length === 0) return `упаковка · ${p.label}`;
  return parts.join(" · ");
}
