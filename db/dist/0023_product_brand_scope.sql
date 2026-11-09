
-- 0023_product_brand_scope.sql / SHA256 fcd109be47f2d715b0a39386817ef1e1db803e2d7438b2c2b4ffab1b1bdb5082
-- Scoped ownership is structural, so non-brand facets can read the compact
-- product index without repeating the same brand lookup for every product.
CREATE UNIQUE INDEX brands_id_store ON brands(id,store_id);
ALTER TABLE products ADD CONSTRAINT products_brand_store_fk FOREIGN KEY(brand_id,store_id) REFERENCES brands(id,store_id);

INSERT INTO schema_migrations (name, checksum) VALUES ('0023_product_brand_scope.sql', 'fcd109be47f2d715b0a39386817ef1e1db803e2d7438b2c2b4ffab1b1bdb5082') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
