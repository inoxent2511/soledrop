-- Scoped ownership is structural, so non-brand facets can read the compact
-- product index without repeating the same brand lookup for every product.
CREATE UNIQUE INDEX brands_id_store ON brands(id,store_id);
ALTER TABLE products ADD CONSTRAINT products_brand_store_fk FOREIGN KEY(brand_id,store_id) REFERENCES brands(id,store_id);
