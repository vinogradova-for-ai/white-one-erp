-- Универсальные комментарии. Полиморфная привязка через (entityType, entityId).
-- Целостность поддерживается приложением, не FK — это упрощает добавление
-- новых типов сущностей без миграций.

CREATE TABLE "Comment" (
  "id"          TEXT NOT NULL,
  "entityType"  TEXT NOT NULL,
  "entityId"    TEXT NOT NULL,
  "authorId"    TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "photoUrls"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "parentId"    TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3),
  "deletedAt"   TIMESTAMP(3),

  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Comment_entityType_entityId_createdAt_idx"
  ON "Comment" ("entityType", "entityId", "createdAt");

CREATE INDEX "Comment_authorId_idx"
  ON "Comment" ("authorId");
