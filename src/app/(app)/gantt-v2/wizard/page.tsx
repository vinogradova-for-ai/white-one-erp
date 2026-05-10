import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { WizardClient, type WizardOrder } from "@/components/gantt-v2/wizard-client";

function iso(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function GanttWizardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "OWNER" && session.user.role !== "DIRECTOR") {
    redirect("/gantt-v2");
  }

  const orders = await prisma.order.findMany({
    where: { deletedAt: null, status: { not: "ON_SALE" } },
    orderBy: [{ launchMonth: "asc" }, { createdAt: "asc" }],
    include: {
      productModel: { select: { name: true, photoUrls: true } },
      factory: { select: { name: true } },
      lines: {
        select: { quantity: true, productVariant: { select: { colorName: true, photoUrls: true } } },
      },
    },
  });

  const items: WizardOrder[] = orders.map((o) => {
    const colors = o.lines.map((l) => l.productVariant?.colorName ?? "?").join(", ");
    const totalQty = o.lines.reduce((a, l) => a + l.quantity, 0);
    const photoUrl =
      o.lines[0]?.productVariant?.photoUrls?.[0] ??
      o.productModel.photoUrls?.[0] ??
      null;
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      title: o.productModel.name,
      subtitle: `${colors} · ${totalQty} шт${o.factory?.name ? ` · ${o.factory.name}` : ""}`,
      statusLabel: ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS],
      photoUrl,
      decisionDate: iso(o.decisionDate),
      handedToFactoryDate: iso(o.handedToFactoryDate),
      readyAtFactoryDate: iso(o.readyAtFactoryDate),
      qcDate: iso(o.qcDate),
      arrivalPlannedDate: iso(o.arrivalPlannedDate),
    };
  });

  return <WizardClient items={items} />;
}
