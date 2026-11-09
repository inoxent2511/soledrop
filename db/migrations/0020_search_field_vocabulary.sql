-- Tiny field-aware vocabulary avoids scanning all postings to discover whether
-- a term's relevance is constant. UTF-16 lengths match the shared JS scorer.
CREATE TABLE IF NOT EXISTS search_field_vocabulary (
  store_id BINARY(16) NOT NULL,
  term VARCHAR(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  field VARCHAR(8) NOT NULL CHECK(field IN ('title','body')),
  document_frequency INT NOT NULL CHECK(document_frequency>=0),
  length INT NOT NULL CHECK(length>=0),
  PRIMARY KEY(store_id,term,field),
  INDEX search_field_vocabulary_length(store_id,length,term,field),
  CONSTRAINT search_field_vocabulary_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO search_field_vocabulary(store_id,term,field,document_frequency,length)
SELECT store_id,term,field,COUNT(*),LENGTH(CONVERT(term USING utf16))/2
FROM search_field_terms GROUP BY store_id,term,field;
