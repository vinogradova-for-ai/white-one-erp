import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/server/api-helpers";
import { buildK3Preview, buildK3Workbook } from "@/server/chz-export";

// IMPORT_K3 для «Честного знака»: ?category=Пальто[&preview=1][&modelIds=a,b]
// Доступно всем ролям (Алёна 16.07: «функционал ЧЗ по умолчанию всем доступен»).
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const sp = req.nextUrl.searchParams;
    const category = sp.get("category") ?? "";
    const modelIds = sp.get("modelIds")?.split(",").filter(Boolean);

    const preview = await buildK3Preview(category, modelIds);
    if (!preview) {
      return NextResponse.json(
        { error: { code: "bad_category", message: `Категория «${category}» не замаплена на шаблон ЧЗ` } },
        { status: 400 },
      );
    }

    if (sp.get("preview")) return NextResponse.json(preview);

    const wb = await buildK3Workbook(preview);
    const buf = await wb.xlsx.writeBuffer();
    const filename = encodeURIComponent(`IMPORT_K3_${category}_WhiteOne.xlsx`);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
