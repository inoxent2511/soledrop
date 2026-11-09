-- Retain the shared table default; substring comparisons explicitly use binary
-- bytes and do not depend on the engine's accent/case collation rules.
ALTER TABLE order_search_documents DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
