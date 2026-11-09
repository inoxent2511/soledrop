-- Covering text-search branches read compact store ranges instead of wide order rows and
-- one correlated contact lookup per order. Keep each existing substring/collation rule.
CREATE INDEX orders_store_phone ON orders(store_id,phone,id);
CREATE INDEX orders_store_total_asc ON orders(store_id,total,placed_at DESC,id);
CREATE INDEX orders_store_placed_asc ON orders(store_id,placed_at,id);
