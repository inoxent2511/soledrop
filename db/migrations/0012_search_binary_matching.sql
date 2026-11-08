-- Text is already folded with the shared Unicode normalizer. Binary comparisons preserve
-- JavaScript word semantics (for example, straße and strasse remain distinct).
ALTER TABLE search_field_terms MODIFY COLUMN term VARCHAR(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_document_terms MODIFY COLUMN term VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_terms MODIFY COLUMN term VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_skus MODIFY COLUMN compact VARCHAR(190) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_documents DROP INDEX search_document_fulltext;
ALTER TABLE search_documents MODIFY COLUMN title TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, MODIFY COLUMN body TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
CREATE FULLTEXT INDEX search_document_fulltext ON search_documents (title, body);
