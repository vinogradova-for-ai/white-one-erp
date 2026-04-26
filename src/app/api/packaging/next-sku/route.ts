import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/server/api-helpers";
import { PACKAGING_TYPES } from "@/lib/validators/packaging";

const PREFIX: Record<string, string> = {
  LABEL: "BIR",
  SIZE_LABEL: "SZ",
  POLYBAG: "PB",
  MESH: "MSH",
  COVER: "CVR",
  BAG: "BAG",
  BOX: "BOX",
  CARE_LABEL: "CARE",
  OTHER: "OTH",
};

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const type = req.nextUrl.searchParams.get("type") ?? "OTHER";
    if (!(PACKAGING_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ sku: "" });
    }
    const prefix = PREFIX[type] ?? "PKG";
    const items = await prisma.packagingItem.findMany({
      where: { sku: { startsWith: `${prefix}-` } },
      select: { sku: true },
    });
    let maxNum = 0;
    for (const it of items) {
      const m = it.sku?.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
    }
    const next = String(maxNum + 1).padStart(3, "0");
    return NextResponse.json({ sku: `${prefix}-${next}` });
  } catch (e) {
    return apiError(e);
  }
}
