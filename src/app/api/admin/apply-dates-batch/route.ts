import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/server/api-helpers";

// Принимает массив объектов с датами по конкретным заказам и применяет их.
// Идентификация — по orderNumber (так Алёне удобнее, чем по UUID).
// Только OWNER. Используется опросником в чате с Claude: после ответов
// Алёны генерируется JSON, который вставляется в /gantt-v2/import.

const itemSchema = z.object({
  orderNumber: z.string().min(1),
  decisionDate: z.string().nullable().optional(),
  handedToFactoryDate: z.string().nullable().optional(),
  readyAtFactoryDate: z.string().nullable().optional(),
  qcDate: z.string().nullable().optional(),
  arrivalPlannedDate: z.string().nullable().optional(),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1),
});

export async function POST(req: Request) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "OWNER") {
      return NextResponse.json({ error: { code: "forbidden" } }, { status: 403 });
    }

    const body = bodySchema.parse(await req.json());
    let updated = 0;
    const notFound: string[] = [];
    const errors: Array<{ orderNumber: string; message: string }> = [];

    for (const it of body.items) {
      const order = await prisma.order.findFirst({
        where: { orderNumber: it.orderNumber, deletedAt: null },
        select: { id: true },
      });
      if (!order) {
        notFound.push(it.orderNumber);
        continue;
      }
      const data: Record<string, Date | null> = {};
      const setIf = (k: keyof typeof it) => {
        const v = it[k];
        if (v === undefined) return;
        data[k as string] = v ? new Date(v) : null;
      };
      setIf("decisionDate");
      setIf("handedToFactoryDate");
      setIf("readyAtFactoryDate");
      setIf("qcDate");
      setIf("arrivalPlannedDate");
      try {
        await prisma.order.update({ where: { id: order.id }, data });
        updated += 1;
      } catch (err) {
        errors.push({ orderNumber: it.orderNumber, message: (err as Error).message });
      }
    }

    return NextResponse.json({ ok: true, updated, notFound, errors });
  } catch (err) {
    return NextResponse.json(
      { error: { code: "internal", message: (err as Error).message } },
      { status: 500 },
    );
  }
}
