-- Count scoped coverage through a compact index, with tenant consistency enforced
-- by composite foreign keys rather than assumed from application writes.
CREATE UNIQUE INDEX products_id_store ON products(id,store_id);
CREATE UNIQUE INDEX price_lists_id_store ON price_lists(id,store_id);
ALTER TABLE product_list_prices ADD INDEX listing_prices_scope(store_id,price_list_id,product_id),
  ADD CONSTRAINT listing_prices_product_store_fk FOREIGN KEY(product_id,store_id) REFERENCES products(id,store_id) ON DELETE CASCADE,
  ADD CONSTRAINT listing_prices_list_store_fk FOREIGN KEY(price_list_id,store_id) REFERENCES price_lists(id,store_id) ON DELETE CASCADE;
