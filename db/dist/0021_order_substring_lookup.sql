
-- 0021_order_substring_lookup.sql / SHA256 ceb7cfcfe4af0aee141f37e7ad42c083eb4523f5ad8ad384669a92a20fa1d1fa
-- Re-run the bounded JS order reindex before startup after this upgrade.
CREATE TABLE IF NOT EXISTS order_search_values (
  store_id BINARY(16) NOT NULL,
  value_hash BINARY(32) NOT NULL,
  kind TINYINT NOT NULL CHECK(kind IN (0,1)),
  normalized_text TEXT NOT NULL,
  PRIMARY KEY(store_id,value_hash),
  CONSTRAINT order_search_value_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS order_search_grams (
  store_id BINARY(16) NOT NULL,
  gram VARBINARY(12) NOT NULL,
  value_hash BINARY(32) NOT NULL,
  PRIMARY KEY(store_id,gram,value_hash),
  INDEX order_search_gram_value(store_id,value_hash),
  CONSTRAINT order_search_gram_value_fk FOREIGN KEY(store_id,value_hash) REFERENCES order_search_values(store_id,value_hash) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS order_search_links (
  store_id BINARY(16) NOT NULL,
  order_id BINARY(16) NOT NULL,
  value_hash BINARY(32) NOT NULL,
  PRIMARY KEY(store_id,value_hash,order_id),
  INDEX order_search_link_order(order_id),
  CONSTRAINT order_search_link_value_fk FOREIGN KEY(store_id,value_hash) REFERENCES order_search_values(store_id,value_hash) ON DELETE CASCADE,
  CONSTRAINT order_search_link_order_fk FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE order_search_documents ADD COLUMN search_version TINYINT NOT NULL DEFAULT 0;

INSERT INTO schema_migrations (name, checksum) VALUES ('0021_order_substring_lookup.sql', 'ceb7cfcfe4af0aee141f37e7ad42c083eb4523f5ad8ad384669a92a20fa1d1fa') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
