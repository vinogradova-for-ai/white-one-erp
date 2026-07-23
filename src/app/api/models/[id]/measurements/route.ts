import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";

// Замеры фасона (мерочный лист): размер × параметр → сантиметры.
// GET — все замеры фасона; PUT — полная замена набора (экран шлёт таблицу целиком).
// Источник правды размерных сеток для Студии и карточек ВБ.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await params;
    const measurements = await prisma.measurement.findMany({
      where: { productModelId: id },
      orderBy: [{ param: "asc" }, { size: "asc" }],
    });
    return NextResponse.json({ measurements });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: "нужен rows: [{size, param, valueCm}]" }, { status: 400 });
    }
    const rows = (body.rows as Array<{ size?: string; param?: string; valueCm?: number | string | null }>)
      .filter((r) => r.size && r.param)
      .map((r) => ({
        size: String(r.size).trim(),
        param: String(r.param).trim(),
        valueCm:
          r.valueCm === null || r.valueCm === undefined || r.valueCm === ""
            ? null
            : Number(String(r.valueCm).replace(",", ".")),
      }))
      .filter((r) => r.valueCm === null || Number.isFinite(r.valueCm));
    await prisma.$transaction([
      prisma.measurement.deleteMany({ where: { productModelId: id } }),
      prisma.measurement.createMany({ data: rows.map((r) => ({ ...r, productModelId: id })) }),
    ]);
    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (e) {
    return apiError(e);
  }
}
