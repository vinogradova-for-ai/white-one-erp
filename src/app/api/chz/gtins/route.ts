import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/server/api-helpers";
import { importGtinsFromK3 } from "@/server/chz-export";

// Приём GTIN из выгрузки ЧЗ (тот же файл K3, где «Код товара» заполнен).
// multipart/form-data, поле file.
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "no_file", message: "Приложите файл выгрузки ЧЗ (.xlsx)" } },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const report = await importGtinsFromK3(buffer);
    return NextResponse.json(report);
  } catch (e) {
    return apiError(e);
  }
}
