
-- 0012_search_binary_matching.sql / SHA256 d7911c3e1d2e6686433b35634601f00ca3712201d52f500ae1411133bd95d30a
-- Text is already folded with the shared Unicode normalizer. Binary comparisons preserve
-- JavaScript word semantics (for example, straße and strasse remain distinct).
ALTER TABLE search_field_terms MODIFY COLUMN term VARCHAR(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_document_terms MODIFY COLUMN term VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_terms MODIFY COLUMN term VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_skus MODIFY COLUMN compact VARCHAR(190) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_documents DROP INDEX search_document_fulltext;
ALTER TABLE search_documents MODIFY COLUMN title TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, MODIFY COLUMN body TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
CREATE FULLTEXT INDEX search_document_fulltext ON search_documents (title, body);

INSERT INTO schema_migrations (name, checksum) VALUES ('0012_search_binary_matching.sql', 'd7911c3e1d2e6686433b35634601f00ca3712201d52f500ae1411133bd95d30a') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
