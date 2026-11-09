-- Facet caches read this committed revision on every request. Relevant writes
-- advance it in their existing store-first transaction, including imports.
CREATE TABLE IF NOT EXISTS catalogue_read_revisions (
  store_id BINARY(16) NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(store_id),
  CONSTRAINT catalogue_read_revision_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO catalogue_read_revisions(store_id,revision) SELECT id,0 FROM stores;
