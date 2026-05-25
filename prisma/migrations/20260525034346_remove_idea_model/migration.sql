-- Удаление модели Idea (пул идей до фасона).
-- Алёна явно отметила: фича мёртвая, никогда не использовалась, удаляем.
-- CASCADE снимет связи: ProductModel.promotedFromIdea / User.ideasCreated.

DROP TABLE IF EXISTS "Idea" CASCADE;
DROP TYPE IF EXISTS "IdeaStatus";
DROP TYPE IF EXISTS "IdeaPriority";
