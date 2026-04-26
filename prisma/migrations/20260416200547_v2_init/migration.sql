-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'DIRECTOR', 'PRODUCT_MANAGER', 'ASSISTANT', 'CONTENT_MANAGER', 'LOGISTICS', 'CUSTOMS', 'WB_MANAGER', 'INTERN');

-- CreateEnum
CREATE TYPE "DevelopmentType" AS ENUM ('OWN', 'REPEAT');

-- CreateEnum
CREATE TYPE "ProductModelStatus" AS ENUM ('IDEA', 'PATTERNS', 'SAMPLE', 'APPROVED', 'IN_PRODUCTION');

-- CreateEnum
CREATE TYPE "ProductVariantStatus" AS ENUM ('DRAFT', 'READY_TO_ORDER', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('SEASONAL', 'RESTOCK', 'TEST');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PREPARATION', 'FABRIC_ORDERED', 'SEWING', 'QC', 'READY_SHIP', 'IN_TRANSIT', 'WAREHOUSE_MSK', 'PACKING', 'SHIPPED_WB', 'ON_SALE');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('CARGO', 'AIR', 'RAIL', 'DOMESTIC');

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('REQUESTED', 'IN_SEWING', 'DELIVERED', 'APPROVED', 'READY_FOR_SHOOT', 'RETURNED');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('NEW', 'CONSIDERING', 'PROMOTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "IdeaPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "QcDefectCategory" AS ENUM ('SEWING', 'FABRIC', 'FITTINGS', 'SIZE', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DELAY', 'INCOMING_DELIVERY', 'PAYMENT_DUE', 'PLAN_GAP', 'STATUS_CHANGED', 'ISSUE', 'SAMPLE_READY', 'QC_REQUIRED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'IMPORT', 'EXPORT');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('RUB', 'CNY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'INTERN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "telegramChatId" BIGINT,
    "telegramLinkCode" TEXT,
    "telegramLinkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "contactName" TEXT,
    "contactInfo" TEXT,
    "capacityPerMonth" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Factory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeGrid" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizes" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SizeGrid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "tags" TEXT[],
    "sizeGridId" TEXT,
    "fabricName" TEXT,
    "fabricConsumption" DECIMAL(6,2),
    "fabricPricePerMeter" DECIMAL(12,2),
    "fabricCurrency" "Currency",
    "countryOfOrigin" TEXT NOT NULL,
    "preferredFactoryId" TEXT,
    "developmentType" "DevelopmentType" NOT NULL DEFAULT 'OWN',
    "isRepeat" BOOLEAN NOT NULL DEFAULT false,
    "previousVersionId" TEXT,
    "patternsUrl" TEXT,
    "patternVersion" TEXT,
    "techPackUrl" TEXT,
    "sampleApprovalUrl" TEXT,
    "photoUrls" TEXT[],
    "correctionsNeeded" BOOLEAN NOT NULL DEFAULT false,
    "sizeChartReady" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProductModelStatus" NOT NULL DEFAULT 'IDEA',
    "ownerId" TEXT NOT NULL,
    "patternsDate" TIMESTAMP(3),
    "sampleDate" TIMESTAMP(3),
    "approvedDate" TIMESTAMP(3),
    "productionStartDate" TIMESTAMP(3),
    "plannedLaunchMonth" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "colorName" TEXT NOT NULL,
    "pantoneCode" TEXT,
    "photoUrls" TEXT[],
    "defaultSizeProportion" JSONB,
    "purchasePriceCny" DECIMAL(12,2),
    "purchasePriceRub" DECIMAL(12,2),
    "cnyRubRate" DECIMAL(10,4),
    "packagingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wbLogisticsCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wbPrice" DECIMAL(12,2),
    "customerPrice" DECIMAL(12,2),
    "wbCommissionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "drrPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "plannedRedemptionPct" DECIMAL(5,2),
    "fullCost" DECIMAL(12,2),
    "marginBeforeDrr" DECIMAL(12,2),
    "marginAfterDrrPct" DECIMAL(6,2),
    "roi" DECIMAL(6,2),
    "markupPct" DECIMAL(6,2),
    "lengthCm" DECIMAL(6,1),
    "widthCm" DECIMAL(6,1),
    "heightCm" DECIMAL(6,1),
    "weightG" INTEGER,
    "liters" DECIMAL(6,2),
    "hsCode" TEXT,
    "packagingType" TEXT,
    "status" "ProductVariantStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sample" (
    "id" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "status" "SampleStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sewingStartDate" TIMESTAMP(3),
    "deliveredDate" TIMESTAMP(3),
    "approvedDate" TIMESTAMP(3),
    "readyForShootDate" TIMESTAMP(3),
    "returnedDate" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvalComment" TEXT,
    "approvedPhotoUrl" TEXT,
    "plannedShootDate" TIMESTAMP(3),
    "shootCompleted" BOOLEAN NOT NULL DEFAULT false,
    "photoUrls" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "season" TEXT,
    "launchMonth" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sizeDistribution" JSONB,
    "sizeDistributionActual" JSONB,
    "snapshotFullCost" DECIMAL(12,2),
    "snapshotWbPrice" DECIMAL(12,2),
    "snapshotCustomerPrice" DECIMAL(12,2),
    "snapshotWbCommissionPct" DECIMAL(5,2),
    "snapshotDrrPct" DECIMAL(5,2),
    "snapshotRedemptionPct" DECIMAL(5,2),
    "batchCost" DECIMAL(14,2),
    "plannedRevenue" DECIMAL(14,2),
    "plannedMargin" DECIMAL(14,2),
    "factoryId" TEXT,
    "ownerId" TEXT NOT NULL,
    "deliveryMethod" "DeliveryMethod",
    "status" "OrderStatus" NOT NULL DEFAULT 'PREPARATION',
    "decisionDate" TIMESTAMP(3),
    "handedToFactoryDate" TIMESTAMP(3),
    "sewingStartDate" TIMESTAMP(3),
    "readyAtFactoryDate" TIMESTAMP(3),
    "shipmentDate" TIMESTAMP(3),
    "arrivalPlannedDate" TIMESTAMP(3),
    "arrivalActualDate" TIMESTAMP(3),
    "packingDoneDate" TIMESTAMP(3),
    "wbShipmentDate" TIMESTAMP(3),
    "saleStartDate" TIMESTAMP(3),
    "paymentTerms" TEXT,
    "prepaymentAmount" DECIMAL(14,2),
    "prepaymentDate" TIMESTAMP(3),
    "prepaymentPaid" BOOLEAN NOT NULL DEFAULT false,
    "finalPaymentAmount" DECIMAL(14,2),
    "finalPaymentDate" TIMESTAMP(3),
    "finalPaymentPaid" BOOLEAN NOT NULL DEFAULT false,
    "packagingType" TEXT,
    "packagingOrdered" BOOLEAN NOT NULL DEFAULT false,
    "specReady" BOOLEAN NOT NULL DEFAULT false,
    "specUrl" TEXT,
    "declarationReady" BOOLEAN NOT NULL DEFAULT false,
    "declarationUrl" TEXT,
    "qcDate" TIMESTAMP(3),
    "qcQuantityOk" INTEGER,
    "qcQuantityDefects" INTEGER,
    "qcDefectsPhotoUrl" TEXT,
    "qcDefectCategory" "QcDefectCategory",
    "qcReplacedByFactory" BOOLEAN NOT NULL DEFAULT false,
    "qcResolutionNote" TEXT,
    "isDelayed" BOOLEAN NOT NULL DEFAULT false,
    "hasIssue" BOOLEAN NOT NULL DEFAULT false,
    "wbCardReady" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductModelStatusLog" (
    "id" TEXT NOT NULL,
    "productModelId" TEXT NOT NULL,
    "fromStatus" "ProductModelStatus",
    "toStatus" "ProductModelStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "comment" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductModelStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantStatusLog" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "fromStatus" "ProductVariantStatus",
    "toStatus" "ProductVariantStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "comment" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVariantStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "comment" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SampleStatusLog" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "fromStatus" "SampleStatus",
    "toStatus" "SampleStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "comment" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SampleStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyPlan" (
    "id" TEXT NOT NULL,
    "yearMonth" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "plannedRevenue" DECIMAL(14,2) NOT NULL,
    "plannedQuantity" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "priority" "IdeaPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "IdeaStatus" NOT NULL DEFAULT 'NEW',
    "createdById" TEXT NOT NULL,
    "rejectedReason" TEXT,
    "promotedToModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Factory_name_key" ON "Factory"("name");

-- CreateIndex
CREATE INDEX "Factory_isActive_idx" ON "Factory"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SizeGrid_name_key" ON "SizeGrid"("name");

-- CreateIndex
CREATE INDEX "ProductModel_status_idx" ON "ProductModel"("status");

-- CreateIndex
CREATE INDEX "ProductModel_ownerId_idx" ON "ProductModel"("ownerId");

-- CreateIndex
CREATE INDEX "ProductModel_category_idx" ON "ProductModel"("category");

-- CreateIndex
CREATE INDEX "ProductModel_deletedAt_idx" ON "ProductModel"("deletedAt");

-- CreateIndex
CREATE INDEX "ProductModel_plannedLaunchMonth_idx" ON "ProductModel"("plannedLaunchMonth");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productModelId_idx" ON "ProductVariant"("productModelId");

-- CreateIndex
CREATE INDEX "ProductVariant_sku_idx" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_status_idx" ON "ProductVariant"("status");

-- CreateIndex
CREATE INDEX "ProductVariant_deletedAt_idx" ON "ProductVariant"("deletedAt");

-- CreateIndex
CREATE INDEX "Sample_productModelId_idx" ON "Sample"("productModelId");

-- CreateIndex
CREATE INDEX "Sample_productVariantId_idx" ON "Sample"("productVariantId");

-- CreateIndex
CREATE INDEX "Sample_status_idx" ON "Sample"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_orderNumber_idx" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_productVariantId_idx" ON "Order"("productVariantId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_launchMonth_idx" ON "Order"("launchMonth");

-- CreateIndex
CREATE INDEX "Order_ownerId_idx" ON "Order"("ownerId");

-- CreateIndex
CREATE INDEX "Order_factoryId_idx" ON "Order"("factoryId");

-- CreateIndex
CREATE INDEX "Order_deletedAt_idx" ON "Order"("deletedAt");

-- CreateIndex
CREATE INDEX "Order_isDelayed_idx" ON "Order"("isDelayed");

-- CreateIndex
CREATE INDEX "ProductModelStatusLog_productModelId_changedAt_idx" ON "ProductModelStatusLog"("productModelId", "changedAt");

-- CreateIndex
CREATE INDEX "ProductVariantStatusLog_productVariantId_changedAt_idx" ON "ProductVariantStatusLog"("productVariantId", "changedAt");

-- CreateIndex
CREATE INDEX "OrderStatusLog_orderId_changedAt_idx" ON "OrderStatusLog"("orderId", "changedAt");

-- CreateIndex
CREATE INDEX "SampleStatusLog_sampleId_changedAt_idx" ON "SampleStatusLog"("sampleId", "changedAt");

-- CreateIndex
CREATE INDEX "MonthlyPlan_yearMonth_idx" ON "MonthlyPlan"("yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPlan_yearMonth_category_key" ON "MonthlyPlan"("yearMonth", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Idea_promotedToModelId_key" ON "Idea"("promotedToModelId");

-- CreateIndex
CREATE INDEX "Idea_status_idx" ON "Idea"("status");

-- CreateIndex
CREATE INDEX "Idea_priority_idx" ON "Idea"("priority");

-- CreateIndex
CREATE INDEX "Idea_createdById_idx" ON "Idea"("createdById");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_sizeGridId_fkey" FOREIGN KEY ("sizeGridId") REFERENCES "SizeGrid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_preferredFactoryId_fkey" FOREIGN KEY ("preferredFactoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "ProductModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModel" ADD CONSTRAINT "ProductModel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sample" ADD CONSTRAINT "Sample_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModelStatusLog" ADD CONSTRAINT "ProductModelStatusLog_productModelId_fkey" FOREIGN KEY ("productModelId") REFERENCES "ProductModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductModelStatusLog" ADD CONSTRAINT "ProductModelStatusLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantStatusLog" ADD CONSTRAINT "ProductVariantStatusLog_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantStatusLog" ADD CONSTRAINT "ProductVariantStatusLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusLog" ADD CONSTRAINT "OrderStatusLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusLog" ADD CONSTRAINT "OrderStatusLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleStatusLog" ADD CONSTRAINT "SampleStatusLog_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SampleStatusLog" ADD CONSTRAINT "SampleStatusLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_promotedToModelId_fkey" FOREIGN KEY ("promotedToModelId") REFERENCES "ProductModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
