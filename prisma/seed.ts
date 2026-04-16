import { PrismaClient, Role, Brand, ProductStatus, OrderStatus, OrderType, DevelopmentType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed…");

  const passwordHash = await bcrypt.hash("whiteone2026", 10);

  // === USERS ===
  const usersData: Array<{ email: string; name: string; role: Role }> = [
    { email: "alena@whiteone.ru", name: "Алёна", role: "OWNER" },
    { email: "dasha@whiteone.ru", name: "Даша", role: "DIRECTOR" },
    { email: "vera@whiteone.ru", name: "Вера", role: "PRODUCT_MANAGER" },
    { email: "olya.pm@whiteone.ru", name: "Оля (PM, Гуанчжоу)", role: "PRODUCT_MANAGER" },
    { email: "nastya@whiteone.ru", name: "Настя", role: "ASSISTANT" },
    { email: "katya@whiteone.ru", name: "Катя (контент)", role: "CONTENT_MANAGER" },
    { email: "tanya@whiteone.ru", name: "Таня", role: "LOGISTICS" },
    { email: "elina@whiteone.ru", name: "Элина", role: "CUSTOMS" },
    { email: "vika@whiteone.ru", name: "Вика", role: "WB_MANAGER" },
    { email: "liza@whiteone.ru", name: "Лиза", role: "WB_MANAGER" },
    { email: "intern.katya@whiteone.ru", name: "Катя (стажёр)", role: "INTERN" },
  ];

  const users: Record<string, string> = {};
  for (const u of usersData) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash },
    });
    users[u.email] = row.id;
  }
  console.log(`✓ Users: ${usersData.length}`);

  // === FACTORIES ===
  const factoriesData = [
    { name: "Фабрика Москва-Пальто", country: "Россия", city: "Москва", capacityPerMonth: 12000 },
    { name: "Guangzhou Apparel #1", country: "Китай", city: "Гуанчжоу", capacityPerMonth: 15000 },
    { name: "Guangzhou Apparel #2", country: "Китай", city: "Гуанчжоу", capacityPerMonth: 10000 },
    { name: "Guangzhou Knit Co.", country: "Китай", city: "Гуанчжоу", capacityPerMonth: 20000 },
    { name: "Бишкек-Текстиль", country: "Кыргызстан", city: "Бишкек", capacityPerMonth: 8000 },
  ];

  const factories: Record<string, string> = {};
  for (const f of factoriesData) {
    const row = await prisma.factory.upsert({
      where: { name: f.name },
      update: {},
      create: f,
    });
    factories[f.name] = row.id;
  }
  console.log(`✓ Factories: ${factoriesData.length}`);

  // === MONTHLY PLANS (демо на 2026) ===
  const plansData = [
    // Пальто
    ...monthly("Пальто", "WHITE_ONE", [0, 3_000_000, 3_000_000, 5_000_000, 10_000_000, 30_000_000, 80_000_000, 200_000_000, 180_000_000, 100_000_000, 50_000_000, 20_000_000]),
    // Брюки
    ...monthly("Брюки", "WHITE_ONE", [0, 5_000_000, 20_000_000, 30_000_000, 25_000_000, 20_000_000, 15_000_000, 10_000_000, 10_000_000, 10_000_000, 8_000_000, 5_000_000]),
    // Лето
    ...monthly("Лето", "WHITE_ONE", [0, 3_000_000, 20_000_000, 20_000_000, 15_000_000, 10_000_000, 5_000_000, 0, 0, 0, 0, 0]),
    // Новые товары
    ...monthly("Новые товары", "WHITE_ONE", [0, 0, 0, 10_000_000, 60_000_000, 160_000_000, 100_000_000, 50_000_000, 30_000_000, 20_000_000, 10_000_000, 5_000_000]),
    // Сердцебиение
    ...monthly("Сердцебиение", "SERDCEBIENIE", [0, 0, 5_000_000, 10_000_000, 15_000_000, 20_000_000, 30_000_000, 25_000_000, 20_000_000, 15_000_000, 10_000_000, 5_000_000]),
  ];

  for (const p of plansData) {
    await prisma.monthlyPlan.upsert({
      where: {
        yearMonth_brand_category: {
          yearMonth: p.yearMonth,
          brand: p.brand,
          category: p.category,
        },
      },
      update: { plannedRevenue: p.plannedRevenue },
      create: p,
    });
  }
  console.log(`✓ MonthlyPlan: ${plansData.length}`);

  // === PRODUCTS (20 демо-изделий) ===
  const productsData = [
    makeProduct({ sku: "П_038_шоколад_безэполет", name: "Пальто Классика Двубортное Миди шоколад", brand: "WHITE_ONE", category: "Пальто", subcategory: "Пальто Классика Миди", color: "шоколад", fabric: "диагональ", status: "READY_FOR_PRODUCTION", owner: users["vera@whiteone.ru"], factory: factories["Фабрика Москва-Пальто"], cny: 2800, rate: 13.5, packaging: 300, logistics: 450, wbPrice: 39900, customerPrice: 22000, commission: 17, redemption: 30, liters: 12 }),
    makeProduct({ sku: "П_042_черный_эполет", name: "Пальто Классика Двубортное Миди чёрный", brand: "WHITE_ONE", category: "Пальто", subcategory: "Пальто Классика Миди", color: "чёрный", fabric: "диагональ", status: "READY_FOR_PRODUCTION", owner: users["vera@whiteone.ru"], factory: factories["Фабрика Москва-Пальто"], cny: 2800, rate: 13.5, packaging: 300, logistics: 450, wbPrice: 39900, customerPrice: 22000, commission: 17, redemption: 30, liters: 12 }),
    makeProduct({ sku: "П_051_бордо_длинное", name: "Пальто Классика Длинное бордо", brand: "WHITE_ONE", category: "Пальто", subcategory: "Пальто Классика Длинное", color: "бордо", fabric: "кашемир", status: "APPROVED", owner: users["vera@whiteone.ru"], factory: factories["Фабрика Москва-Пальто"], cny: 3200, rate: 13.5, packaging: 350, logistics: 500, wbPrice: 45900, customerPrice: 25000, commission: 17, redemption: 28, liters: 14 }),
    makeProduct({ sku: "БР_012_черный_палаццо", name: "Брюки Палаццо оверсайз чёрные", brand: "WHITE_ONE", category: "Брюки", subcategory: "Палаццо оверсайз", color: "чёрный", fabric: "вискоза", status: "READY_FOR_PRODUCTION", owner: users["olya.pm@whiteone.ru"], factory: factories["Guangzhou Apparel #1"], cny: 180, rate: 13.5, packaging: 80, logistics: 90, wbPrice: 3990, customerPrice: 2200, commission: 20, redemption: 35, liters: 3 }),
    makeProduct({ sku: "БР_018_серый_классика", name: "Брюки Классика серые", brand: "WHITE_ONE", category: "Брюки", subcategory: "Классика", color: "серый", fabric: "костюмная", status: "SAMPLE", owner: users["olya.pm@whiteone.ru"], factory: factories["Guangzhou Apparel #1"], cny: 160, rate: 13.5, packaging: 80, logistics: 90, wbPrice: 3490, customerPrice: 1950, commission: 20, redemption: 30, liters: 3 }),
    makeProduct({ sku: "Л_007_белый_кимоно", name: "Платье-кимоно белое", brand: "WHITE_ONE", category: "Лето", subcategory: "Платье-кимоно", color: "белый", fabric: "лён", status: "READY_FOR_PRODUCTION", owner: users["olya.pm@whiteone.ru"], factory: factories["Guangzhou Knit Co."], cny: 120, rate: 13.5, packaging: 60, logistics: 70, wbPrice: 2990, customerPrice: 1650, commission: 22, redemption: 30, liters: 2 }),
    makeProduct({ sku: "Л_011_пудра_кимоно", name: "Платье-кимоно пудра", brand: "WHITE_ONE", category: "Лето", subcategory: "Платье-кимоно", color: "пудра", fabric: "лён", status: "SIZE_CHART", owner: users["olya.pm@whiteone.ru"], factory: factories["Guangzhou Knit Co."], cny: 120, rate: 13.5, packaging: 60, logistics: 70, wbPrice: 2990, customerPrice: 1650, commission: 22, redemption: 30, liters: 2 }),
    makeProduct({ sku: "НТ_003_черный_жакет", name: "Жакет структурированный", brand: "WHITE_ONE", category: "Новые товары", subcategory: "Жакет", color: "чёрный", fabric: "смесовая", status: "PATTERNS", owner: users["vera@whiteone.ru"], factory: factories["Guangzhou Apparel #2"], cny: 350, rate: 13.5, packaging: 100, logistics: 120, wbPrice: 6990, customerPrice: 3850, commission: 18, redemption: 28, liters: 4 }),
    makeProduct({ sku: "НТ_008_молоко_рубашка", name: "Рубашка объёмная молочная", brand: "WHITE_ONE", category: "Новые товары", subcategory: "Рубашка", color: "молочный", fabric: "хлопок", status: "IDEA", owner: users["vera@whiteone.ru"], factory: factories["Guangzhou Apparel #2"], cny: 140, rate: 13.5, packaging: 60, logistics: 70, wbPrice: 3290, customerPrice: 1800, commission: 20, redemption: 32, liters: 2 }),
    makeProduct({ sku: "НТ_012_беж_костюм", name: "Костюм двойка бежевый", brand: "WHITE_ONE", category: "Новые товары", subcategory: "Костюм", color: "бежевый", fabric: "шерсть", status: "SKETCH", owner: users["olya.pm@whiteone.ru"], factory: factories["Guangzhou Apparel #1"], cny: 480, rate: 13.5, packaging: 150, logistics: 180, wbPrice: 9990, customerPrice: 5500, commission: 17, redemption: 27, liters: 7 }),
    makeProduct({ sku: "СР_002_черный_платье", name: "Платье Сердцебиение черное", brand: "SERDCEBIENIE", category: "Сердцебиение", subcategory: "Платье", color: "чёрный", fabric: "вискоза", status: "READY_FOR_PRODUCTION", owner: users["olya.pm@whiteone.ru"], factory: factories["Guangzhou Knit Co."], cny: 220, rate: 13.5, packaging: 90, logistics: 100, wbPrice: 4990, customerPrice: 2750, commission: 20, redemption: 32, liters: 3 }),
    makeProduct({ sku: "СР_004_беж_юбка", name: "Юбка-миди Сердцебиение беж", brand: "SERDCEBIENIE", category: "Сердцебиение", subcategory: "Юбка", color: "бежевый", fabric: "вискоза", status: "APPROVED", owner: users["olya.pm@whiteone.ru"], factory: factories["Guangzhou Knit Co."], cny: 140, rate: 13.5, packaging: 60, logistics: 70, wbPrice: 2990, customerPrice: 1650, commission: 22, redemption: 30, liters: 2 }),
  ];

  const products: Array<{ id: string; customerPrice: number; fullCost: number }> = [];
  for (const p of productsData) {
    const row = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: p,
    });
    products.push({
      id: row.id,
      customerPrice: Number(p.customerPrice),
      fullCost: Number(row.fullCost ?? 0),
    });
  }
  console.log(`✓ Products: ${productsData.length}`);

  // === ORDERS (20 демо-заказов) ===
  const readyProducts = productsData
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.status === "READY_FOR_PRODUCTION")
    .map(({ i }) => products[i]);

  const orderStatuses: OrderStatus[] = [
    "PREPARATION", "FABRIC_ORDERED", "SEWING", "QC", "READY_SHIP",
    "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE",
  ];

  let orderCounter = 1;
  const year = 2026;

  for (const rp of readyProducts) {
    for (let i = 0; i < 3; i++) {
      const status = orderStatuses[(orderCounter + i) % orderStatuses.length];
      const month = 4 + ((orderCounter + i) % 6); // апрель-сентябрь
      const qty = 500 + ((orderCounter * 113) % 2000);
      const number = `ORD-${year}-${String(orderCounter).padStart(4, "0")}`;

      const ownerKey = orderCounter % 2 === 0 ? "vera@whiteone.ru" : "olya.pm@whiteone.ru";
      const factoryKey = orderCounter % 3 === 0 ? "Фабрика Москва-Пальто" : orderCounter % 3 === 1 ? "Guangzhou Apparel #1" : "Guangzhou Knit Co.";

      await prisma.order.upsert({
        where: { orderNumber: number },
        update: {},
        create: {
          orderNumber: number,
          productId: rp.id,
          orderType: (orderCounter % 4 === 0 ? "RESTOCK" : "SEASONAL") as OrderType,
          season: month >= 9 ? "Осень 2026" : month >= 6 ? "Лето 2026" : "Весна 2026",
          launchMonth: year * 100 + month,
          quantity: qty,
          factoryId: factories[factoryKey],
          ownerId: users[ownerKey],
          status,
          decisionDate: new Date(year, month - 3, 1),
          handedToFactoryDate: status >= "FABRIC_ORDERED" ? new Date(year, month - 2, 15) : null,
          sewingStartDate: ["SEWING", "QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"].includes(status) ? new Date(year, month - 2, 20) : null,
          readyAtFactoryDate: ["QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"].includes(status) ? new Date(year, month - 1, 10) : null,
          shipmentDate: ["IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"].includes(status) ? new Date(year, month - 1, 15) : null,
          arrivalPlannedDate: new Date(year, month - 1, 25),
          arrivalActualDate: ["WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"].includes(status) ? new Date(year, month - 1, 27) : null,
          wbShipmentDate: ["SHIPPED_WB", "ON_SALE"].includes(status) ? new Date(year, month, 1) : null,
          saleStartDate: status === "ON_SALE" ? new Date(year, month, 3) : null,
          snapshotFullCost: rp.fullCost,
          snapshotCustomerPrice: rp.customerPrice,
          batchCost: rp.fullCost * qty,
          plannedRevenue: rp.customerPrice * 0.3 * qty,
          plannedMargin: (rp.customerPrice * 0.3 - rp.fullCost) * qty,
          isDelayed: orderCounter % 7 === 0,
          hasIssue: orderCounter % 11 === 0,
          packagingType: "полибэг",
          paymentTerms: "30/70",
          deliveryMethod: orderCounter % 3 === 0 ? "DOMESTIC" : "CARGO",
        },
      });
      orderCounter++;
    }
  }
  console.log(`✓ Orders: ${orderCounter - 1}`);

  console.log("🌱 Done.");
}

// ==== helpers ====

function monthly(category: string, brand: Brand, amounts: number[]) {
  return amounts.map((amount, idx) => ({
    yearMonth: 202601 + idx,
    brand,
    category,
    plannedRevenue: amount,
  }));
}

function makeProduct(opts: {
  sku: string;
  name: string;
  brand: Brand;
  category: string;
  subcategory?: string;
  color: string;
  fabric: string;
  status: ProductStatus;
  owner: string;
  factory: string;
  cny: number;
  rate: number;
  packaging: number;
  logistics: number;
  wbPrice: number;
  customerPrice: number;
  commission: number;
  redemption: number;
  liters: number;
}) {
  const purchaseRub = opts.cny * opts.rate * 1.05;
  const fullCost = purchaseRub + opts.packaging + opts.logistics;
  const revenuePerUnit = opts.customerPrice * (opts.redemption / 100);
  const wbCommission = opts.wbPrice * (opts.commission / 100);
  const marginBeforeDrr = revenuePerUnit - fullCost - wbCommission;
  const roi = (marginBeforeDrr / fullCost) * 100;
  const markup = ((opts.wbPrice - fullCost) / fullCost) * 100;

  return {
    sku: opts.sku,
    name: opts.name,
    brand: opts.brand,
    developmentType: "OWN" as DevelopmentType,
    category: opts.category,
    subcategory: opts.subcategory,
    color: opts.color,
    fabric: opts.fabric,
    sizeChart: "42-52",
    status: opts.status,
    ownerId: opts.owner,
    preferredFactoryId: opts.factory,
    countryOfOrigin: opts.factory.includes("Москва") ? "Россия" : opts.factory.includes("Бишкек") ? "Кыргызстан" : "Китай",
    packagingType: "полибэг",
    purchasePriceCny: opts.cny,
    cnyRubRate: opts.rate,
    packagingCost: opts.packaging,
    wbLogisticsCost: opts.logistics,
    wbPrice: opts.wbPrice,
    customerPrice: opts.customerPrice,
    wbCommissionPct: opts.commission,
    plannedRedemptionPct: opts.redemption,
    drrPct: 10,
    liters: opts.liters,
    fullCost: round(fullCost),
    marginBeforeDrr: round(marginBeforeDrr),
    roi: round(roi),
    markupPct: round(markup),
  };
}

function round(n: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
