
-- 0016_order_search_indexes.sql / SHA256 16351560b695d24b7b5c0b6b33a300dd43366b33b82b04b3203bbb49c588e16e
-- Covering text-search branches read compact store ranges instead of wide order rows and
-- one correlated contact lookup per order. Keep each existing substring/collation rule.
CREATE INDEX orders_store_phone ON orders(store_id,phone,id);
CREATE INDEX orders_store_total_asc ON orders(store_id,total,placed_at DESC,id);
CREATE INDEX orders_store_placed_asc ON orders(store_id,placed_at,id);

INSERT INTO schema_migrations (name, checksum) VALUES ('0016_order_search_indexes.sql', '16351560b695d24b7b5c0b6b33a300dd43366b33b82b04b3203bbb49c588e16e') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
