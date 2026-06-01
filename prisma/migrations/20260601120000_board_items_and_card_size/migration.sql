-- Полноценная доска фасонов: размеры/слой карточек + свободные элементы (текст/стикер/картинка).

-- Размер и слой карточки фасона
ALTER TABLE "ProductModel" ADD COLUMN "canvasW" DOUBLE PRECISION;
ALTER TABLE "ProductModel" ADD COLUMN "canvasH" DOUBLE PRECISION;
ALTER TABLE "ProductModel" ADD COLUMN "canvasZ" INTEGER;

-- Тип свободного элемента доски
CREATE TYPE "BoardItemType" AS ENUM ('TEXT', 'STICKY', 'IMAGE');

-- Свободные элементы доски
CREATE TABLE "BoardItem" (
    "id" TEXT NOT NULL,
    "type" "BoardItemType" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "z" INTEGER NOT NULL DEFAULT 0,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "text" TEXT,
    "color" TEXT,
    "fontSize" INTEGER,
    "fontWeight" INTEGER,
    "align" TEXT,
    "imageUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BoardItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardItem_deletedAt_idx" ON "BoardItem"("deletedAt");
CREATE INDEX "BoardItem_z_idx" ON "BoardItem"("z");
