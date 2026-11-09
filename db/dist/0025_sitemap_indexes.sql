
-- 0025_sitemap_indexes.sql / SHA256 e343aa4851224a123e5f670e34786eef7e150bedd1975df567f0ee9b2db082bb
-- Sitemap projections return bounded metadata, never hydrated product graphs.
CREATE INDEX products_sitemap ON products(store_id,status,id,slug,published_at);
CREATE INDEX product_images_sitemap ON product_images(product_id,position,id,url);
CREATE INDEX pages_sitemap ON pages(store_id,published,slug,updated_at);

INSERT INTO schema_migrations (name, checksum) VALUES ('0025_sitemap_indexes.sql', 'e343aa4851224a123e5f670e34786eef7e150bedd1975df567f0ee9b2db082bb') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
