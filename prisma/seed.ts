import {
  PrismaClient,
  Role,
  ProductModelStatus,
  ProductVariantStatus,
  OrderStatus,
  OrderType,
  SampleStatus,
  IdeaStatus,
  IdeaPriority,
  Currency,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Расчёт экономики (те же формулы, что в src/lib/calculations/product-cost.ts)
const COST_BUFFER = 1.05;

function round(n: number, digits = 2): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function calc(v: {
  purchasePriceCny?: number | null;
  purchasePriceRub?: number | null;
  cnyRubRate?: number | null;
  packagingCost?: number;
  wbLogisticsCost?: number;
  wbPrice?: number;
  customerPrice?: number;
  wbCommissionPct?: number;
  drrPct?: number;
  plannedRedemptionPct?: number;
}) {
  const purchase =
    v.purchasePriceCny != null
      ? v.purchasePriceCny * (v.cnyRubRate ?? 13.5) * COST_BUFFER
      : v.purchasePriceRub != null
        ? v.purchasePriceRub
        : 0;

  const fullCost = purchase + (v.packagingCost ?? 0) + (v.wbLogisticsCost ?? 0);

  const redemption = (v.plannedRedemptionPct ?? 0) / 100;
  const revenuePerUnit = (v.customerPrice ?? 0) * redemption;
  const commission = ((v.wbPrice ?? 0) * (v.wbCommissionPct ?? 0)) / 100;
  const marginBeforeDrr = revenuePerUnit - fullCost - commission;
  const marginAfterDrr = marginBeforeDrr - revenuePerUnit * ((v.drrPct ?? 0) / 100);
  const roi = fullCost > 0 ? (marginAfterDrr / fullCost) * 100 : 0;
  const markup = fullCost > 0 ? ((v.wbPrice ?? 0) - fullCost) / fullCost * 100 : 0;

  return {
    fullCost: round(fullCost),
    marginBeforeDrr: round(marginBeforeDrr),
    marginAfterDrrPct: revenuePerUnit > 0 ? round((marginAfterDrr / revenuePerUnit) * 100) : null,
    roi: round(roi),
    markupPct: round(markup),
  };
}

async function main() {
  console.log("🌱 Seed v2 …");

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
  console.log(`✓ Пользователей: ${usersData.length}`);

  // === SIZE GRIDS ===
  const sizeGridsData = [
    { name: "40-60 пальто", sizes: ["40", "42", "44", "46", "48", "50", "52", "54", "56", "58", "60"] },
    { name: "42-52 стандарт", sizes: ["42", "44", "46", "48", "50", "52"] },
    { name: "42-48 премиум", sizes: ["42", "44", "46", "48"] },
    { name: "XS-XXL", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  ];
  const sizeGrids: Record<string, string> = {};
  for (const sg of sizeGridsData) {
    const row = await prisma.sizeGrid.upsert({
      where: { name: sg.name },
      update: {},
      create: sg,
    });
    sizeGrids[sg.name] = row.id;
  }
  console.log(`✓ Размерных сеток: ${sizeGridsData.length}`);

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
  console.log(`✓ Фабрик: ${factoriesData.length}`);

  // === MONTHLY PLANS (на 2026) ===
  const plansData = [
    ...monthly("Пальто", [0, 3_000_000, 3_000_000, 5_000_000, 10_000_000, 30_000_000, 80_000_000, 200_000_000, 180_000_000, 100_000_000, 50_000_000, 20_000_000]),
    ...monthly("Брюки", [0, 5_000_000, 20_000_000, 30_000_000, 25_000_000, 20_000_000, 15_000_000, 10_000_000, 10_000_000, 10_000_000, 8_000_000, 5_000_000]),
    ...monthly("Лето", [0, 3_000_000, 20_000_000, 20_000_000, 15_000_000, 10_000_000, 5_000_000, 0, 0, 0, 0, 0]),
    ...monthly("Новые товары", [0, 0, 0, 10_000_000, 60_000_000, 160_000_000, 100_000_000, 50_000_000, 30_000_000, 20_000_000, 10_000_000, 5_000_000]),
    ...monthly("Сердцебиение", [0, 0, 5_000_000, 10_000_000, 15_000_000, 20_000_000, 30_000_000, 25_000_000, 20_000_000, 15_000_000, 10_000_000, 5_000_000]),
  ];
  for (const p of plansData) {
    await prisma.monthlyPlan.upsert({
      where: { yearMonth_category: { yearMonth: p.yearMonth, category: p.category } },
      update: { plannedRevenue: p.plannedRevenue },
      create: p,
    });
  }
  console.log(`✓ Планов продаж: ${plansData.length}`);

  // === PRODUCT MODELS (фасоны) ===
  // Фото — плейсхолдеры с Unsplash (реальные ссылки для демо)
  const PALTO_PHOTO_1 = "https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=600";
  const PALTO_PHOTO_2 = "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600";
  const BRUKI_PHOTO = "https://images.unsplash.com/photo-1584865288642-42078afe6942?w=600";
  const PLATYE_PHOTO = "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600";
  const ZHAKET_PHOTO = "https://images.unsplash.com/photo-1591047139756-eac29f6d956a?w=600";

  const modelsData: Array<{
    key: string;
    name: string;
    category: string;
    subcategory?: string;
    tags: string[];
    sizeGrid: string;
    country: string;
    factory: string;
    fabricName?: string;
    fabricConsumption?: number;
    fabricPricePerMeter?: number;
    fabricCurrency?: Currency;
    developmentType?: "OWN" | "REPEAT";
    isRepeat?: boolean;
    status: ProductModelStatus;
    owner: string;
    photoUrls: string[];
    patternsUrl?: string;
    techPackUrl?: string;
    notes?: string;
  }> = [
    {
      key: "palto-klassika-miді",
      name: "Пальто Классика Двубортное Миди",
      category: "Пальто",
      subcategory: "Классика Миди",
      tags: ["Осень 2026", "Базовый"],
      sizeGrid: "40-60 пальто",
      country: "Россия",
      factory: "Фабрика Москва-Пальто",
      fabricName: "Диагональ 70% шерсть",
      fabricConsumption: 2.5,
      fabricPricePerMeter: 980,
      fabricCurrency: "RUB",
      isRepeat: true,
      developmentType: "REPEAT",
      status: "IN_PRODUCTION",
      owner: users["vera@whiteone.ru"],
      photoUrls: [PALTO_PHOTO_1, PALTO_PHOTO_2],
      patternsUrl: "https://drive.google.com/drive/palto-klassika-miди",
      notes: "Хит прошлого сезона. Повтор с небольшой доработкой воротника.",
    },
    {
      key: "palto-dlinnoe",
      name: "Пальто Классика Длинное",
      category: "Пальто",
      subcategory: "Классика Длинное",
      tags: ["Осень 2026", "Премиум"],
      sizeGrid: "42-52 стандарт",
      country: "Россия",
      factory: "Фабрика Москва-Пальто",
      fabricName: "Кашемир 100%",
      fabricConsumption: 3.0,
      fabricPricePerMeter: 3200,
      fabricCurrency: "RUB",
      status: "APPROVED",
      owner: users["vera@whiteone.ru"],
      photoUrls: [PALTO_PHOTO_2],
    },
    {
      key: "bruki-palazzo",
      name: "Брюки Палаццо оверсайз",
      category: "Брюки",
      subcategory: "Палаццо оверсайз",
      tags: ["Весна 2026", "Лето 2026", "Офис"],
      sizeGrid: "42-52 стандарт",
      country: "Китай",
      factory: "Guangzhou Apparel #1",
      fabricName: "Вискоза",
      fabricConsumption: 1.8,
      fabricPricePerMeter: 32,
      fabricCurrency: "CNY",
      isRepeat: true,
      developmentType: "REPEAT",
      status: "IN_PRODUCTION",
      owner: users["olya.pm@whiteone.ru"],
      photoUrls: [BRUKI_PHOTO],
    },
    {
      key: "bruki-klassika",
      name: "Брюки Классика прямые",
      category: "Брюки",
      subcategory: "Классика",
      tags: ["Осень 2026", "Офис", "Базовый"],
      sizeGrid: "42-52 стандарт",
      country: "Китай",
      factory: "Guangzhou Apparel #1",
      fabricName: "Костюмная смесовая",
      fabricConsumption: 1.5,
      fabricPricePerMeter: 28,
      fabricCurrency: "CNY",
      status: "SAMPLE",
      owner: users["olya.pm@whiteone.ru"],
      photoUrls: [BRUKI_PHOTO],
    },
    {
      key: "platye-kimono",
      name: "Платье-кимоно летнее",
      category: "Лето",
      subcategory: "Платье-кимоно",
      tags: ["Лето 2026", "Casual"],
      sizeGrid: "XS-XXL",
      country: "Китай",
      factory: "Guangzhou Knit Co.",
      fabricName: "Лён 100%",
      fabricConsumption: 2.0,
      fabricPricePerMeter: 18,
      fabricCurrency: "CNY",
      status: "IN_PRODUCTION",
      owner: users["olya.pm@whiteone.ru"],
      photoUrls: [PLATYE_PHOTO],
    },
    {
      key: "zhaket-strukturirovannyy",
      name: "Жакет структурированный",
      category: "Новые товары",
      subcategory: "Жакет",
      tags: ["Осень 2026", "Офис", "Новинка"],
      sizeGrid: "42-48 премиум",
      country: "Китай",
      factory: "Guangzhou Apparel #2",
      fabricName: "Смесовая костюмная",
      fabricConsumption: 2.2,
      fabricPricePerMeter: 45,
      fabricCurrency: "CNY",
      status: "PATTERNS",
      owner: users["vera@whiteone.ru"],
      photoUrls: [ZHAKET_PHOTO],
    },
    {
      key: "rubashka-obyomnaya",
      name: "Рубашка объёмная оверсайз",
      category: "Новые товары",
      subcategory: "Рубашка",
      tags: ["Лето 2026", "Casual", "Новинка"],
      sizeGrid: "XS-XXL",
      country: "Китай",
      factory: "Guangzhou Apparel #2",
      status: "IDEA",
      owner: users["vera@whiteone.ru"],
      photoUrls: [],
      notes: "Пока только идея, лекал нет",
    },
    {
      key: "platye-serdcebienie",
      name: "Платье Сердцебиение миди",
      category: "Сердцебиение",
      subcategory: "Платье миди",
      tags: ["Сердцебиение", "Осень 2026"],
      sizeGrid: "42-52 стандарт",
      country: "Китай",
      factory: "Guangzhou Knit Co.",
      fabricName: "Вискоза плотная",
      fabricConsumption: 1.7,
      fabricPricePerMeter: 38,
      fabricCurrency: "CNY",
      status: "IN_PRODUCTION",
      owner: users["olya.pm@whiteone.ru"],
      photoUrls: [PLATYE_PHOTO],
    },
  ];

  const models: Record<string, { id: string; category: string; sizeGrid: string }> = {};
  for (const m of modelsData) {
    const row = await prisma.productModel.create({
      data: {
        name: m.name,
        category: m.category,
        subcategory: m.subcategory,
        tags: m.tags,
        sizeGridId: sizeGrids[m.sizeGrid],
        countryOfOrigin: m.country,
        preferredFactoryId: factories[m.factory],
        fabricName: m.fabricName,
        fabricConsumption: m.fabricConsumption,
        fabricPricePerMeter: m.fabricPricePerMeter,
        fabricCurrency: m.fabricCurrency,
        developmentType: m.developmentType ?? "OWN",
        isRepeat: m.isRepeat ?? false,
        status: m.status,
        ownerId: m.owner,
        photoUrls: m.photoUrls,
        patternsUrl: m.patternsUrl,
        techPackUrl: m.techPackUrl,
        notes: m.notes,
        sizeChartReady: m.status !== "IDEA" && m.status !== "PATTERNS",
      },
    });
    models[m.key] = { id: row.id, category: m.category, sizeGrid: m.sizeGrid };
  }
  console.log(`✓ Фасонов: ${modelsData.length}`);

  // === PRODUCT VARIANTS (цветовые варианты) ===
  // Каждый фасон имеет несколько цветов. Пропорция размеров по категории.
  const SIZE_PROPORTIONS: Record<string, Record<string, number>> = {
    "40-60 пальто": { "40": 3, "42": 8, "44": 15, "46": 20, "48": 20, "50": 15, "52": 10, "54": 5, "56": 2, "58": 1, "60": 1 },
    "42-52 стандарт": { "42": 10, "44": 20, "46": 25, "48": 25, "50": 12, "52": 8 },
    "42-48 премиум": { "42": 20, "44": 30, "46": 30, "48": 20 },
    "XS-XXL": { "XS": 8, "S": 20, "M": 30, "L": 25, "XL": 12, "XXL": 5 },
  };

  const variantsData: Array<{
    modelKey: string;
    sku: string;
    colorName: string;
    pantoneCode?: string;
    photoUrls: string[];
    status: ProductVariantStatus;
    cny?: number;
    rub?: number;
    rate?: number;
    packaging: number;
    logistics: number;
    wbPrice: number;
    customerPrice: number;
    commission: number;
    redemption: number;
    liters?: number;
  }> = [
    // Пальто Классика Миди — 3 цвета
    { modelKey: "palto-klassika-miді", sku: "П_038_шоколад", colorName: "шоколад", pantoneCode: "18-1016", photoUrls: [PALTO_PHOTO_1], status: "READY_TO_ORDER", rub: 5400, packaging: 300, logistics: 450, wbPrice: 39900, customerPrice: 22000, commission: 17, redemption: 30, liters: 12 },
    { modelKey: "palto-klassika-miді", sku: "П_038_чёрный", colorName: "чёрный", pantoneCode: "19-0303", photoUrls: [PALTO_PHOTO_2], status: "READY_TO_ORDER", rub: 5400, packaging: 300, logistics: 450, wbPrice: 39900, customerPrice: 22000, commission: 17, redemption: 30, liters: 12 },
    { modelKey: "palto-klassika-miді", sku: "П_038_бордо", colorName: "бордо", pantoneCode: "19-1934", photoUrls: [PALTO_PHOTO_1], status: "READY_TO_ORDER", rub: 5400, packaging: 300, logistics: 450, wbPrice: 39900, customerPrice: 22000, commission: 17, redemption: 30, liters: 12 },

    // Пальто Длинное — 2 цвета
    { modelKey: "palto-dlinnoe", sku: "П_051_бордо", colorName: "бордо", photoUrls: [PALTO_PHOTO_2], status: "READY_TO_ORDER", rub: 12000, packaging: 350, logistics: 500, wbPrice: 45900, customerPrice: 25000, commission: 17, redemption: 28, liters: 14 },
    { modelKey: "palto-dlinnoe", sku: "П_051_графит", colorName: "графит", photoUrls: [PALTO_PHOTO_2], status: "DRAFT", rub: 12000, packaging: 350, logistics: 500, wbPrice: 45900, customerPrice: 25000, commission: 17, redemption: 28, liters: 14 },

    // Палаццо — 3 цвета
    { modelKey: "bruki-palazzo", sku: "БР_012_чёрный", colorName: "чёрный", photoUrls: [BRUKI_PHOTO], status: "READY_TO_ORDER", cny: 180, rate: 13.5, packaging: 80, logistics: 90, wbPrice: 3990, customerPrice: 2200, commission: 20, redemption: 35, liters: 3 },
    { modelKey: "bruki-palazzo", sku: "БР_012_беж", colorName: "бежевый", photoUrls: [BRUKI_PHOTO], status: "READY_TO_ORDER", cny: 180, rate: 13.5, packaging: 80, logistics: 90, wbPrice: 3990, customerPrice: 2200, commission: 20, redemption: 35, liters: 3 },
    { modelKey: "bruki-palazzo", sku: "БР_012_хаки", colorName: "хаки", photoUrls: [BRUKI_PHOTO], status: "READY_TO_ORDER", cny: 180, rate: 13.5, packaging: 80, logistics: 90, wbPrice: 3990, customerPrice: 2200, commission: 20, redemption: 35, liters: 3 },

    // Брюки Классика — 2 цвета (в разработке)
    { modelKey: "bruki-klassika", sku: "БР_018_серый", colorName: "серый", photoUrls: [BRUKI_PHOTO], status: "DRAFT", cny: 160, rate: 13.5, packaging: 80, logistics: 90, wbPrice: 3490, customerPrice: 1950, commission: 20, redemption: 30, liters: 3 },
    { modelKey: "bruki-klassika", sku: "БР_018_чёрный", colorName: "чёрный", photoUrls: [BRUKI_PHOTO], status: "DRAFT", cny: 160, rate: 13.5, packaging: 80, logistics: 90, wbPrice: 3490, customerPrice: 1950, commission: 20, redemption: 30, liters: 3 },

    // Платье-кимоно — 2 цвета
    { modelKey: "platye-kimono", sku: "Л_007_белый", colorName: "белый", photoUrls: [PLATYE_PHOTO], status: "READY_TO_ORDER", cny: 120, rate: 13.5, packaging: 60, logistics: 70, wbPrice: 2990, customerPrice: 1650, commission: 22, redemption: 30, liters: 2 },
    { modelKey: "platye-kimono", sku: "Л_007_пудра", colorName: "пудра", photoUrls: [PLATYE_PHOTO], status: "READY_TO_ORDER", cny: 120, rate: 13.5, packaging: 60, logistics: 70, wbPrice: 2990, customerPrice: 1650, commission: 22, redemption: 30, liters: 2 },

    // Жакет — 1 цвет (в разработке)
    { modelKey: "zhaket-strukturirovannyy", sku: "НТ_003_чёрный", colorName: "чёрный", photoUrls: [ZHAKET_PHOTO], status: "DRAFT", cny: 350, rate: 13.5, packaging: 100, logistics: 120, wbPrice: 6990, customerPrice: 3850, commission: 18, redemption: 28, liters: 4 },

    // Платье Сердцебиение — 2 цвета
    { modelKey: "platye-serdcebienie", sku: "СР_002_чёрный", colorName: "чёрный", photoUrls: [PLATYE_PHOTO], status: "READY_TO_ORDER", cny: 220, rate: 13.5, packaging: 90, logistics: 100, wbPrice: 4990, customerPrice: 2750, commission: 20, redemption: 32, liters: 3 },
    { modelKey: "platye-serdcebienie", sku: "СР_002_беж", colorName: "бежевый", photoUrls: [PLATYE_PHOTO], status: "READY_TO_ORDER", cny: 220, rate: 13.5, packaging: 90, logistics: 100, wbPrice: 4990, customerPrice: 2750, commission: 20, redemption: 32, liters: 3 },
  ];

  const variants: Array<{ id: string; modelKey: string; sku: string; customerPrice: number; fullCost: number }> = [];
  for (const v of variantsData) {
    const model = models[v.modelKey];
    const eco = calc({
      purchasePriceCny: v.cny,
      purchasePriceRub: v.rub,
      cnyRubRate: v.rate,
      packagingCost: v.packaging,
      wbLogisticsCost: v.logistics,
      wbPrice: v.wbPrice,
      customerPrice: v.customerPrice,
      wbCommissionPct: v.commission,
      drrPct: 10,
      plannedRedemptionPct: v.redemption,
    });

    const proportion = SIZE_PROPORTIONS[model.sizeGrid];

    const row = await prisma.productVariant.create({
      data: {
        productModelId: model.id,
        sku: v.sku,
        colorName: v.colorName,
        pantoneCode: v.pantoneCode,
        photoUrls: v.photoUrls,
        defaultSizeProportion: proportion,
        purchasePriceCny: v.cny,
        purchasePriceRub: v.rub,
        cnyRubRate: v.rate,
        packagingCost: v.packaging,
        wbLogisticsCost: v.logistics,
        wbPrice: v.wbPrice,
        customerPrice: v.customerPrice,
        wbCommissionPct: v.commission,
        drrPct: 10,
        plannedRedemptionPct: v.redemption,
        liters: v.liters,
        status: v.status,
        fullCost: eco.fullCost,
        marginBeforeDrr: eco.marginBeforeDrr,
        marginAfterDrrPct: eco.marginAfterDrrPct,
        roi: eco.roi,
        markupPct: eco.markupPct,
      },
    });

    variants.push({
      id: row.id,
      modelKey: v.modelKey,
      sku: v.sku,
      customerPrice: v.customerPrice,
      fullCost: eco.fullCost ?? 0,
    });
  }
  console.log(`✓ Вариантов: ${variantsData.length}`);

  // === SAMPLES (образцы) ===
  const samplesData: Array<{ modelKey: string; variantSku?: string; status: SampleStatus }> = [
    { modelKey: "zhaket-strukturirovannyy", variantSku: "НТ_003_чёрный", status: "IN_SEWING" },
    { modelKey: "bruki-klassika", variantSku: "БР_018_серый", status: "DELIVERED" },
    { modelKey: "bruki-klassika", variantSku: "БР_018_чёрный", status: "APPROVED" },
    { modelKey: "palto-dlinnoe", variantSku: "П_051_бордо", status: "READY_FOR_SHOOT" },
    { modelKey: "palto-dlinnoe", variantSku: "П_051_графит", status: "READY_FOR_SHOOT" },
  ];
  for (const s of samplesData) {
    const model = models[s.modelKey];
    const variant = variants.find((v) => v.sku === s.variantSku);
    await prisma.sample.create({
      data: {
        productModelId: model.id,
        productVariantId: variant?.id,
        status: s.status,
        requestDate: new Date("2026-03-15"),
        sewingStartDate: s.status !== "REQUESTED" ? new Date("2026-03-20") : null,
        deliveredDate: ["DELIVERED", "APPROVED", "READY_FOR_SHOOT", "RETURNED"].includes(s.status) ? new Date("2026-04-05") : null,
        approvedDate: ["APPROVED", "READY_FOR_SHOOT", "RETURNED"].includes(s.status) ? new Date("2026-04-08") : null,
        readyForShootDate: ["READY_FOR_SHOOT", "RETURNED"].includes(s.status) ? new Date("2026-04-10") : null,
        approvedById: ["APPROVED", "READY_FOR_SHOOT", "RETURNED"].includes(s.status) ? users["vera@whiteone.ru"] : null,
        approvalComment: ["APPROVED", "READY_FOR_SHOOT", "RETURNED"].includes(s.status) ? "Образец соответствует ТЗ, к отшиву готов." : null,
      },
    });
  }
  console.log(`✓ Образцов: ${samplesData.length}`);

  // === IDEAS ===
  const ideasData = [
    { title: "Пальто-пиджак укороченный", description: "Интересная категория между пальто и жакетом. Кашемир, свободный крой.", tags: ["Осень 2026", "Новинка"], priority: "HIGH" as IdeaPriority, status: "CONSIDERING" as IdeaStatus },
    { title: "Юбка-миди сатин", description: "Для комплекта с топом. Разные цвета.", tags: ["Весна 2026", "Новинка"], priority: "MEDIUM" as IdeaPriority, status: "NEW" as IdeaStatus },
    { title: "Тренч со вшитым поясом", description: "Повтор хита конкурентов в нашем качестве.", tags: ["Весна 2026", "Повтор"], priority: "HIGH" as IdeaPriority, status: "NEW" as IdeaStatus },
    { title: "Костюм тройка", description: "Жакет + брюки + жилет, премиум сегмент.", tags: ["Зима 2026", "Офис"], priority: "LOW" as IdeaPriority, status: "NEW" as IdeaStatus },
    { title: "Жилет стёганый", description: "Обдумать — может оказаться не по сезону.", tags: ["Осень 2026"], priority: "LOW" as IdeaPriority, status: "REJECTED" as IdeaStatus },
  ];
  for (const i of ideasData) {
    await prisma.idea.create({
      data: {
        ...i,
        createdById: users["alena@whiteone.ru"],
        rejectedReason: i.status === "REJECTED" ? "Пересекается с существующей линейкой." : null,
      },
    });
  }
  console.log(`✓ Идей: ${ideasData.length}`);

  // === ORDERS (заказы на варианты в READY_TO_ORDER) ===
  const readyVariants = variants.filter((v) =>
    ["П_038_шоколад", "П_038_чёрный", "П_038_бордо", "П_051_бордо",
     "БР_012_чёрный", "БР_012_беж", "БР_012_хаки",
     "Л_007_белый", "Л_007_пудра",
     "СР_002_чёрный", "СР_002_беж"].includes(v.sku)
  );

  const orderStatuses: OrderStatus[] = [
    "PREPARATION", "FABRIC_ORDERED", "SEWING", "QC", "READY_SHIP",
    "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE",
  ];

  let orderCounter = 1;
  const year = 2026;

  for (const rv of readyVariants) {
    for (let i = 0; i < 2; i++) {
      const status = orderStatuses[(orderCounter + i) % orderStatuses.length];
      const month = 5 + ((orderCounter + i) % 5);
      const qty = 500 + ((orderCounter * 113) % 1500);
      const number = `ORD-${year}-${String(orderCounter).padStart(4, "0")}`;

      // Распределение по размерам — используем пропорцию варианта
      const variant = await prisma.productVariant.findUnique({
        where: { id: rv.id },
        select: { defaultSizeProportion: true },
      });
      let sizeDist: Record<string, number> = {};
      if (variant?.defaultSizeProportion) {
        const pct = variant.defaultSizeProportion as Record<string, number>;
        let distributed = 0;
        const entries = Object.entries(pct);
        entries.forEach(([size, p], idx) => {
          if (idx === entries.length - 1) {
            sizeDist[size] = qty - distributed;
          } else {
            const share = Math.floor(qty * p / 100);
            sizeDist[size] = share;
            distributed += share;
          }
        });
      }

      const ownerKey = orderCounter % 2 === 0 ? "vera@whiteone.ru" : "olya.pm@whiteone.ru";
      const factoryKey = orderCounter % 3 === 0 ? "Фабрика Москва-Пальто"
        : orderCounter % 3 === 1 ? "Guangzhou Apparel #1"
        : "Guangzhou Knit Co.";

      await prisma.order.create({
        data: {
          orderNumber: number,
          productVariantId: rv.id,
          orderType: (orderCounter % 4 === 0 ? "RESTOCK" : "SEASONAL") as OrderType,
          season: month >= 9 ? "Осень 2026" : month >= 6 ? "Лето 2026" : "Весна 2026",
          launchMonth: year * 100 + month,
          quantity: qty,
          sizeDistribution: sizeDist,
          factoryId: factories[factoryKey],
          ownerId: users[ownerKey],
          status,
          decisionDate: new Date(year, month - 3, 1),
          handedToFactoryDate: status !== "PREPARATION" ? new Date(year, month - 2, 15) : null,
          sewingStartDate: ["SEWING", "QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"].includes(status) ? new Date(year, month - 2, 20) : null,
          readyAtFactoryDate: ["QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"].includes(status) ? new Date(year, month - 1, 10) : null,
          shipmentDate: ["IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"].includes(status) ? new Date(year, month - 1, 15) : null,
          arrivalPlannedDate: new Date(year, month - 1, 25),
          arrivalActualDate: ["WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"].includes(status) ? new Date(year, month - 1, 27) : null,
          wbShipmentDate: ["SHIPPED_WB", "ON_SALE"].includes(status) ? new Date(year, month, 1) : null,
          saleStartDate: status === "ON_SALE" ? new Date(year, month, 3) : null,
          snapshotFullCost: rv.fullCost,
          snapshotCustomerPrice: rv.customerPrice,
          batchCost: rv.fullCost * qty,
          plannedRevenue: rv.customerPrice * 0.3 * qty,
          plannedMargin: (rv.customerPrice * 0.3 - rv.fullCost) * qty,
          isDelayed: orderCounter % 7 === 0,
          hasIssue: orderCounter % 11 === 0,
          packagingType: "полибэг",
          paymentTerms: "30/70",
          deliveryMethod: orderCounter % 3 === 0 ? "DOMESTIC" : "CARGO",
          // QC-данные для заказов в нужных статусах
          qcDate: ["QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"].includes(status) ? new Date(year, month - 1, 11) : null,
          qcQuantityOk: ["QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"].includes(status) ? qty - (orderCounter % 5) : null,
          qcQuantityDefects: ["QC", "READY_SHIP", "IN_TRANSIT", "WAREHOUSE_MSK", "PACKING", "SHIPPED_WB", "ON_SALE"].includes(status) ? (orderCounter % 5) : null,
        },
      });
      orderCounter++;
    }
  }
  console.log(`✓ Заказов: ${orderCounter - 1}`);

  console.log("🌱 Готово!");
}

function monthly(category: string, amounts: number[]) {
  return amounts.map((amount, idx) => ({
    yearMonth: 202601 + idx,
    category,
    plannedRevenue: amount,
  }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
