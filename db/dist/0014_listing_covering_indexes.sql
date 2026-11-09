
-- 0014_listing_covering_indexes.sql / SHA256 19c3f448e2f1a76e4ee353d068cfb6a3c91aebddb25b5f7c3af57cbcfdaf5c3d
-- Existing CHECK enums already restrict these strings to short values. Smaller index keys
-- retain every valid value and permit covering facet indexes within both engines' key limits.
ALTER TABLE products MODIFY COLUMN status VARCHAR(16) NOT NULL DEFAULT 'draft',
  MODIFY COLUMN kind VARCHAR(16) NOT NULL,
  MODIFY COLUMN gender VARCHAR(16) NOT NULL,
  MODIFY COLUMN condition_grade VARCHAR(16) NULL;
CREATE INDEX products_store_status_facets ON products(store_id,status,gender,condition_grade,brand_id,position,id);
CREATE INDEX products_store_status_newest ON products(store_id,status,published_at DESC,position,id);
CREATE INDEX products_store_status_title ON products(store_id,status,title,position,id);
CREATE INDEX variants_product_size ON variants(product_id,size_eu);
CREATE INDEX variants_size_product ON variants(size_eu,product_id);
CREATE INDEX orders_store_total_desc ON orders(store_id,total DESC,placed_at DESC,id);

INSERT INTO schema_migrations (name, checksum) VALUES ('0014_listing_covering_indexes.sql', '19c3f448e2f1a76e4ee353d068cfb6a3c91aebddb25b5f7c3af57cbcfdaf5c3d') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
