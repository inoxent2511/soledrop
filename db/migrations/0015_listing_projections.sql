-- Compact, transactional projections avoid materializing wide variant/price tables on GET.
CREATE TABLE IF NOT EXISTS product_listing_sizes (
  product_id BINARY(16) NOT NULL,
  store_id BINARY(16) NOT NULL,
  size_eu VARCHAR(190) NOT NULL,
  PRIMARY KEY(product_id,size_eu),
  INDEX listing_sizes_store_size(store_id,size_eu,product_id),
  CONSTRAINT listing_sizes_product_fk FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT listing_sizes_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_list_prices (
  product_id BINARY(16) NOT NULL,
  price_list_id BINARY(16) NOT NULL,
  store_id BINARY(16) NOT NULL,
  amount BIGINT NOT NULL CHECK(amount BETWEEN 0 AND 9007199254740991),
  compare_at BIGINT NULL CHECK(compare_at BETWEEN -9007199254740991 AND 9007199254740991),
  PRIMARY KEY(product_id,price_list_id),
  INDEX listing_prices_list_amount(price_list_id,amount,product_id),
  CONSTRAINT listing_prices_product_fk FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT listing_prices_list_fk FOREIGN KEY(price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE,
  CONSTRAINT listing_prices_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO product_listing_sizes(product_id,store_id,size_eu)
SELECT DISTINCT v.product_id,p.store_id,v.size_eu FROM variants v INNER JOIN products p ON p.id=v.product_id;

INSERT INTO product_list_prices(product_id,price_list_id,store_id,amount,compare_at)
SELECT product_id,price_list_id,store_id,amount,compare_at FROM (
  SELECT v.product_id,pr.price_list_id,p.store_id,pr.amount,pr.compare_at,
    ROW_NUMBER() OVER(PARTITION BY v.product_id,pr.price_list_id ORDER BY pr.amount,v.position,v.id) AS price_rank
  FROM prices pr INNER JOIN variants v ON v.id=pr.variant_id
    INNER JOIN products p ON p.id=v.product_id
    INNER JOIN price_lists pl ON pl.id=pr.price_list_id AND pl.store_id=p.store_id
) ranked_prices WHERE price_rank=1;

CREATE INDEX products_listing_by_id ON products(id,store_id,status,kind,gender,condition_grade,brand_id,published_at,position);
