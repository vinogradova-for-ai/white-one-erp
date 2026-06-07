import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/server/api-helpers";
import { usesCyrillicScheme } from "@/lib/artikul";
import { nextRussiaArtikulBase } from "@/server/artikul";

// Превью следующего номер-артикула для пальто/полупальто (кириллица).
// Форма зовёт это, чтобы показать реальный П_052 ещё до сохранения.
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const category = req.nextUrl.searchParams.get("category") ?? "";
    if (!usesCyrillicScheme(category)) {
      return NextResponse.json({ base: null }); // латиница — номер не нужен
    }
    const base = await nextRussiaArtikulBase(category);
    return NextResponse.json({ base });
  } catch (e) {
    return apiError(e);
  }
}
