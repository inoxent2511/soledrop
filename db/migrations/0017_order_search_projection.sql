-- Rebuild with scripts/reindex-orders.ts before starting this release on an
-- existing database. JavaScript lowercasing preserves the reference search
-- semantics, including Unicode mappings that differ from SQL LOWER().
CREATE TABLE IF NOT EXISTS order_search_documents (
  store_id BINARY(16) NOT NULL,
  order_id BINARY(16) NOT NULL,
  search_text TEXT NOT NULL,
  number_bytes INT UNSIGNED NOT NULL,
  email_bytes INT UNSIGNED NOT NULL,
  phone_bytes INT UNSIGNED NOT NULL,
  phone_digits VARCHAR(190) NOT NULL,
  status VARCHAR(190) NOT NULL,
  payment_status VARCHAR(190) NOT NULL,
  payment_method VARCHAR(190) NOT NULL,
  placed_at DATETIME(3) NOT NULL,
  total BIGINT NOT NULL CHECK(total BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(store_id,order_id),
  UNIQUE INDEX order_search_order(order_id),
  CONSTRAINT order_search_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT order_search_order_fk FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
