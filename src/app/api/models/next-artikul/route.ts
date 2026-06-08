import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/server/api-helpers";
import { usesCyrillicScheme } from "@/lib/artikul";
import { nextRussiaArtikulBase, nextLatinNumber } from "@/server/artikul";

// Превью следующего номера-артикула для формы (показать реальный номер до сохранения).
// Кириллица (пальто/полупальто) → готовая база П_052. Латиница → двухзначный номер (8 → trs08…).
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const category = req.nextUrl.searchParams.get("category") ?? "";
    if (usesCyrillicScheme(category)) {
      const base = await nextRussiaArtikulBase(category);
      return NextResponse.json({ base, number: null });
    }
    const number = await nextLatinNumber(category);
    return NextResponse.json({ base: null, number });
  } catch (e) {
    return apiError(e);
  }
}
