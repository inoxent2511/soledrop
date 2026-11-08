
-- 0010_search_field_indexes.sql / SHA256 a5b78595d55a3d427680a07b4ae1b2f2551c3010c163f47f50d0a62869a652ce
CREATE TABLE IF NOT EXISTS search_field_terms (
  product_id BINARY(16) NOT NULL,
  field VARCHAR(8) NOT NULL,
  term VARCHAR(100) NOT NULL,
  position INT NOT NULL,
  PRIMARY KEY (product_id, field, term),
  INDEX search_field_lookup (term, field, product_id),
  CONSTRAINT search_field_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT search_field_kind_ck CHECK (field IN ('title', 'body')),
  CONSTRAINT search_field_position_ck CHECK (position >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS search_skus (
  store_id BINARY(16) NOT NULL,
  compact VARCHAR(190) NOT NULL,
  product_id BINARY(16) NOT NULL,
  PRIMARY KEY (store_id, compact, product_id),
  CONSTRAINT search_sku_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT search_sku_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (name, checksum) VALUES ('0010_search_field_indexes.sql', 'a5b78595d55a3d427680a07b4ae1b2f2551c3010c163f47f50d0a62869a652ce') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
