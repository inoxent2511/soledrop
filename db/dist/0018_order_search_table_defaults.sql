
-- 0018_order_search_table_defaults.sql / SHA256 9f4bf173926a476638e70c4256b37e58981226032fa0cc894744aad0debe00b6
-- Retain the shared table default; substring comparisons explicitly use binary
-- bytes and do not depend on the engine's accent/case collation rules.
ALTER TABLE order_search_documents DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO schema_migrations (name, checksum) VALUES ('0018_order_search_table_defaults.sql', '9f4bf173926a476638e70c4256b37e58981226032fa0cc894744aad0debe00b6') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
