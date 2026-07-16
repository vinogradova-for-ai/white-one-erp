import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/server/api-helpers";
import { buildRdPreview, buildRdWorkbook } from "@/server/chz-export";

// IMPORT_RD (декларация соответствия): ?docId=…[&preview=1]
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const sp = req.nextUrl.searchParams;
    const docId = sp.get("docId") ?? "";
    const preview = await buildRdPreview(docId);
    if (!preview) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Документ не найден" } },
        { status: 404 },
      );
    }
    if (sp.get("preview")) return NextResponse.json(preview);

    const wb = await buildRdWorkbook(preview);
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("IMPORT_RD_WhiteOne.xlsx")}`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
