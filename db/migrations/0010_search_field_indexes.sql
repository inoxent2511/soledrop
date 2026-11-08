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
