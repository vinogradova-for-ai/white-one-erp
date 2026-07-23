import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    productModel: {
      findMany: vi.fn().mockResolvedValue([
        {
          name: "Пальто Классика",
          brand: "WHITE_ONE",
          category: "Пальто",
          subcategory: null,
          artikulBase: "П_038",
          fabricComposition: "70% шерсть",
          tnvedCode: null,
          photoUrls: ["https://blob/model.jpg"],
          plannedLaunchMonth: 202609,
          status: "IN_PRODUCTION",
          id: "m1",
          sizeGrid: { sizes: ["42", "44"] },
          measurements: [{ size: "42", param: "Обхват груди", valueCm: 90 }],
          variants: [{ sku: "П_038_шоколад", colorName: "шоколад", photoUrls: [] }],
          samples: [{ status: "RECEIVED", receivedDate: new Date("2026-07-01"), pulledForContentAt: null }],
          orders: [
            {
              readyAtFactoryDate: new Date("2026-08-01"),
              shipmentDate: null,
              arrivalPlannedDate: null,
              arrivalActualDate: null,
              wbShipmentDate: null,
              saleStartDate: null,
              wbCardReady: false,
            },
          ],
        },
      ]),
    },
  },
}));

import { GET } from "./route";

const url = "http://localhost/api/external/content-articles";

describe("GET /api/external/content-articles", () => {
  beforeEach(() => {
    process.env.EXTERNAL_API_TOKEN = "test-token";
  });
  afterEach(() => {
    delete process.env.EXTERNAL_API_TOKEN;
  });

  it("503 когда токен не настроен", async () => {
    delete process.env.EXTERNAL_API_TOKEN;
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(503);
  });

  it("401 без/с неверным Bearer", async () => {
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(401);
    const res2 = await GET(new NextRequest(url, { headers: { authorization: "Bearer wrong" } }));
    expect(res2.status).toBe(401);
  });

  it("200 и форма ответа с верным Bearer", async () => {
    const res = await GET(new NextRequest(url, { headers: { authorization: "Bearer test-token" } }));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(Array.isArray(d.articles)).toBe(true);
    expect(d.articles[0]).toMatchObject({
      sku: "П_038_шоколад",
      colorName: "шоколад",
      category: "Пальто",
      sizes: ["42", "44"],
      wbCardReady: false,
    });
    expect(d.articles[0].sample.status).toBe("RECEIVED");
  });
});
