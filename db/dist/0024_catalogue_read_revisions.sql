
-- 0024_catalogue_read_revisions.sql / SHA256 fa551073977601098dd3dd46248f8429f0701598dc7cdcdcdfdb5b2b2059d731
-- Facet caches read this committed revision on every request. Relevant writes
-- advance it in their existing store-first transaction, including imports.
CREATE TABLE IF NOT EXISTS catalogue_read_revisions (
  store_id BINARY(16) NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(store_id),
  CONSTRAINT catalogue_read_revision_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO catalogue_read_revisions(store_id,revision) SELECT id,0 FROM stores;

INSERT INTO schema_migrations (name, checksum) VALUES ('0024_catalogue_read_revisions.sql', 'fa551073977601098dd3dd46248f8429f0701598dc7cdcdcdfdb5b2b2059d731') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
